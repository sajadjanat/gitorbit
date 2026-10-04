use crate::git::{capture, git_command};
use serde::Serialize;
use std::{path::Path, time::Duration};

pub const MAX_COMMITS: usize = 5000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub timestamp: i64,
    pub subject: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct GitRef {
    pub hash: String,
    pub name: String,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub commits: Vec<Commit>,
    pub refs: Vec<GitRef>,
    pub head: Option<String>,
    pub has_more: bool,
    pub shallow: bool,
}

fn run(git: &Path, repo: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut command = git_command(git, repo);
    command.args(args);
    capture(command, Duration::from_secs(20))
}

fn parse_commits(bytes: &[u8]) -> Result<Vec<Commit>, String> {
    let mut fields: Vec<_> = bytes.split(|b| *b == 0).collect();
    if fields.last().is_some_and(|f| f.is_empty()) {
        fields.pop();
    }
    if fields.len() % 5 != 0 {
        return Err("Git returned an incomplete history. Refresh and try again.".into());
    }
    fields
        .chunks_exact(5)
        .map(|f| {
            let text = |i| String::from_utf8_lossy(f[i]).into_owned();
            Ok(Commit {
                hash: text(0),
                parents: text(1).split_whitespace().map(str::to_owned).collect(),
                author: text(2),
                timestamp: text(3)
                    .parse()
                    .map_err(|_| "Git returned an invalid commit date.")?,
                subject: text(4),
            })
        })
        .collect()
}

pub fn read(git: &Path, repo: &Path, limit: usize, scope: &str) -> Result<History, String> {
    if !(1..=MAX_COMMITS).contains(&limit) || !["all", "head"].contains(&scope) {
        return Err("Choose a valid history scope and commit limit.".into());
    }
    // Reject non-repositories before interpreting a missing HEAD as an unborn branch.
    run(git, repo, &["rev-parse", "--git-dir"])?;
    let head = run(git, repo, &["rev-parse", "--verify", "--quiet", "HEAD"])
        .ok()
        .map(|b| String::from_utf8_lossy(&b).trim().to_owned());
    let ref_bytes = run(
        git,
        repo,
        &[
            "for-each-ref",
            "--format=%(objectname)%00%(*objectname)%00%(refname)%00%(symref)",
            "refs/heads",
            "refs/remotes",
            "refs/tags",
        ],
    )?;
    let refs = String::from_utf8_lossy(&ref_bytes)
        .lines()
        .filter_map(|line| {
            let f: Vec<_> = line.split('\0').collect();
            if f.len() != 4 || !f[3].is_empty() {
                return None;
            }
            let (name, kind) = if let Some(n) = f[2].strip_prefix("refs/heads/") {
                (n, "branch")
            } else if let Some(n) = f[2].strip_prefix("refs/remotes/") {
                (n, "remote")
            } else if let Some(n) = f[2].strip_prefix("refs/tags/") {
                (n, "tag")
            } else {
                return None;
            };
            Some(GitRef {
                hash: if f[1].is_empty() { f[0] } else { f[1] }.into(),
                name: name.into(),
                kind: kind.into(),
            })
        })
        .collect::<Vec<_>>();
    let shallow = run(git, repo, &["rev-parse", "--is-shallow-repository"])? == b"true\n";
    if head.is_none() && (scope == "head" || refs.is_empty()) {
        return Ok(History {
            commits: vec![],
            refs,
            head,
            has_more: false,
            shallow,
        });
    }
    let count = format!("--max-count={}", limit + 1);
    let mut args = vec![
        "log",
        "--topo-order",
        "--no-show-signature",
        "--no-color",
        "--encoding=UTF-8",
        "-z",
        "--format=%H%x00%P%x00%an%x00%at%x00%s",
        &count,
    ];
    if scope == "all" {
        args.extend(["--branches", "--remotes", "--tags"]);
    }
    // Including HEAD keeps a detached checkout visible even without a named ref.
    if head.is_some() {
        args.push("HEAD");
    }
    args.push("--");
    let mut commits = parse_commits(&run(git, repo, &args)?)?;
    let has_more = commits.len() > limit;
    commits.truncate(limit);
    Ok(History {
        commits,
        refs,
        head,
        has_more,
        shallow,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::find_git;
    use std::fs;
    fn exec(git: &Path, repo: &Path, args: &[&str]) {
        run(git, repo, args).unwrap();
    }
    fn fixture() -> (tempfile::TempDir, std::path::PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let (git, _) = find_git().expect("Git required for history tests");
        exec(&git, root.path(), &["init", "-q", "-b", "main"]);
        exec(&git, root.path(), &["config", "user.name", "Demo Author"]);
        exec(
            &git,
            root.path(),
            &["config", "user.email", "demo@example.com"],
        );
        exec(&git, root.path(), &["config", "commit.gpgsign", "false"]);
        (root, git)
    }
    fn commit(git: &Path, repo: &Path, subject: &str) {
        exec(git, repo, &["commit", "-q", "--allow-empty", "-m", subject]);
    }
    #[test]
    fn merge_topology_refs_pagination_and_detached_head() {
        let (root, git) = fixture();
        let repo = root.path();
        commit(&git, repo, "Initial");
        exec(&git, repo, &["checkout", "-qb", "feature,with-comma"]);
        commit(&git, repo, "Feature: Unicode café / متن");
        exec(&git, repo, &["checkout", "-q", "main"]);
        commit(&git, repo, "Main");
        exec(
            &git,
            repo,
            &[
                "merge",
                "--no-ff",
                "-m",
                "Merge feature",
                "feature,with-comma",
            ],
        );
        exec(&git, repo, &["tag", "-a", "v1.0", "-m", "Release"]);
        exec(
            &git,
            repo,
            &["update-ref", "refs/remotes/origin/main", "HEAD"],
        );
        let history = read(&git, repo, 200, "all").unwrap();
        assert_eq!(history.commits.len(), 4);
        assert_eq!(history.commits[0].parents.len(), 2);
        assert!(history
            .commits
            .iter()
            .any(|c| c.subject.contains("café / متن")));
        for (index, c) in history.commits.iter().enumerate() {
            for parent in &c.parents {
                assert!(history.commits[index + 1..]
                    .iter()
                    .any(|p| &p.hash == parent));
            }
        }
        assert!(history
            .refs
            .iter()
            .any(|r| r.name == "feature,with-comma" && r.kind == "branch"));
        assert!(history
            .refs
            .iter()
            .any(|r| r.name == "origin/main" && r.kind == "remote"));
        assert!(history
            .refs
            .iter()
            .any(|r| r.name == "v1.0" && r.hash == history.commits[0].hash));
        let page = read(&git, repo, 2, "all").unwrap();
        assert_eq!(page.commits.len(), 2);
        assert!(page.has_more);
        assert!(!history.has_more);
        exec(&git, repo, &["checkout", "--detach", "-q"]);
        commit(&git, repo, "Detached work");
        let detached = read(&git, repo, 200, "all").unwrap();
        assert_eq!(detached.commits[0].subject, "Detached work");
        assert_eq!(detached.head.as_ref(), Some(&detached.commits[0].hash));
        fs::write(repo.join("untouched.txt"), "keep").unwrap();
        read(&git, repo, 200, "head").unwrap();
        assert_eq!(
            fs::read_to_string(repo.join("untouched.txt")).unwrap(),
            "keep"
        );
    }
    #[test]
    fn empty_repository_scope_and_invalid_arguments() {
        let (root, git) = fixture();
        assert!(read(&git, root.path(), 200, "all")
            .unwrap()
            .commits
            .is_empty());
        commit(&git, root.path(), "Initial");
        exec(&git, root.path(), &["checkout", "-qb", "unmerged"]);
        commit(&git, root.path(), "Unmerged branch");
        exec(&git, root.path(), &["checkout", "-q", "main"]);
        assert_eq!(
            read(&git, root.path(), 200, "all").unwrap().commits.len(),
            2
        );
        assert_eq!(
            read(&git, root.path(), 200, "head").unwrap().commits.len(),
            1
        );
        assert!(read(&git, root.path(), 0, "all").is_err());
        assert!(read(&git, root.path(), 10, "--all").is_err());
        assert!(read(&git, root.path(), MAX_COMMITS + 1, "all").is_err());
    }
    #[test]
    fn malformed_history_is_not_a_clean_empty_graph() {
        assert!(parse_commits(b"incomplete\0").is_err());
        assert!(parse_commits(b"hash\0\0author\0invalid\0subject\0").is_err());
    }
}
