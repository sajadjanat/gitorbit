use crate::git::{capture, git_command, parse_status, Repository};
use serde::Serialize;
use std::{collections::HashSet, fs, io::Read, path::Path, time::Duration};

const MAX_OUTGOING_COMMITS: usize = 200;

pub(crate) fn run(git: &Path, repo: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut command = git_command(git, repo);
    command.args(args);
    capture(command, Duration::from_secs(45))
}
pub fn changes(git: &Path, repo: &Path) -> Result<Repository, String> {
    let bytes = run(
        git,
        repo,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
        ],
    )?;
    parse_status(&bytes)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diff {
    pub text: String,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiff {
    pub text: String,
    pub truncated: bool,
    pub before_revision: Option<String>,
    pub after_revision: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outgoing {
    pub head: String,
    pub upstream_head: String,
    pub source_branch: String,
    pub remote: String,
    pub destination_branch: String,
    pub total_commits: usize,
    pub has_more: bool,
    pub commits: Vec<OutgoingCommit>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingCommit {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
}

fn resolve_remote_target(
    git: &Path,
    repo: &Path,
    upstream: &str,
) -> Result<(String, String), String> {
    let remotes = run(git, repo, &["remote"])?;
    String::from_utf8_lossy(&remotes)
        .lines()
        .filter_map(|remote| {
            upstream
                .strip_prefix(&format!("refs/remotes/{remote}/"))
                .map(|branch| (remote.to_owned(), branch.to_owned()))
        })
        .max_by_key(|(remote, _)| remote.len())
        .ok_or_else(|| "The tracked upstream is not a configured remote branch.".into())
}

pub(crate) fn read_upstream(
    git: &Path,
    repo: &Path,
) -> Result<(String, String, String, String, String, String), String> {
    let head = String::from_utf8_lossy(&run(git, repo, &["rev-parse", "--verify", "HEAD"])?)
        .trim()
        .to_owned();
    let source_branch = String::from_utf8_lossy(&run(
        git,
        repo,
        &["symbolic-ref", "--quiet", "--short", "HEAD"],
    )?)
    .trim()
    .to_owned();
    let upstream = String::from_utf8_lossy(&run(
        git,
        repo,
        &["rev-parse", "--symbolic-full-name", "@{upstream}"],
    )?)
    .trim()
    .to_owned();
    let upstream_commit = format!("{upstream}^{{commit}}");
    let upstream_head = String::from_utf8_lossy(&run(
        git,
        repo,
        &["rev-parse", "--verify", upstream_commit.as_str()],
    )?)
    .trim()
    .to_owned();
    let (remote, destination_branch) = resolve_remote_target(git, repo, &upstream)?;
    Ok((
        head,
        upstream_head,
        source_branch,
        upstream,
        remote,
        destination_branch,
    ))
}

pub fn outgoing(git: &Path, repo: &Path) -> Result<Outgoing, String> {
    let (head, upstream_head, source_branch, upstream, remote, destination_branch) =
        read_upstream(git, repo)?;
    let range = format!("{upstream}..HEAD");
    let count = String::from_utf8_lossy(&run(
        git,
        repo,
        &["rev-list", "--count", range.as_str()],
    )?)
    .trim()
    .parse::<usize>()
    .map_err(|_| "Git returned an invalid outgoing commit count.".to_string())?;
    let commits = if count == 0 {
        Vec::new()
    } else {
        let max_count = format!("--max-count={MAX_OUTGOING_COMMITS}");
        let format = "--format=%x1e%H%x00%an%x00%at%x00%s";
        let log = run(
            git,
            repo,
            &[
                "log",
                "--topo-order",
                "--no-color",
                "--encoding=UTF-8",
                max_count.as_str(),
                format,
                range.as_str(),
            ],
        )?;
        parse_outgoing_log(&log)?
    };
    Ok(Outgoing {
        head,
        upstream_head,
        source_branch,
        remote,
        destination_branch,
        total_commits: count,
        has_more: count > commits.len(),
        commits,
    })
}

pub(crate) fn parse_outgoing_log(bytes: &[u8]) -> Result<Vec<OutgoingCommit>, String> {
    bytes
        .split(|byte| *byte == 0x1e)
        .filter(|record| !record.is_empty())
        .map(|record| {
            let fields: Vec<_> = record.split(|byte| *byte == 0).collect();
            if fields.len() != 4 {
                return Err("Git returned an incomplete outgoing commit.".into());
            }
            let timestamp = String::from_utf8_lossy(fields[2])
                .trim()
                .parse::<i64>()
                .map_err(|_| "Git returned an invalid outgoing commit date.".to_string())?;
            Ok(OutgoingCommit {
                hash: String::from_utf8_lossy(fields[0]).trim().to_owned(),
                author: String::from_utf8_lossy(fields[1]).into_owned(),
                timestamp,
                subject: String::from_utf8_lossy(fields[3])
                    .trim_end_matches(['\n', '\r'])
                    .to_owned(),
            })
        })
        .collect()
}

pub fn outgoing_commit_files(
    git: &Path,
    repo: &Path,
    commit_hash: &str,
) -> Result<Vec<CommitFile>, String> {
    if !matches!(commit_hash.len(), 40 | 64)
        || !commit_hash.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Choose a valid commit from the push list.".into());
    }
    let (_, _, _, upstream, _, _) = read_upstream(git, repo)?;
    let range = format!("{upstream}..HEAD");
    let outgoing = run(git, repo, &["rev-list", range.as_str()])?;
    if !String::from_utf8_lossy(&outgoing)
        .lines()
        .any(|hash| hash == commit_hash)
    {
        return Err("This commit is no longer in the outgoing list. Refresh and try again.".into());
    }
    let parent_line = String::from_utf8_lossy(&run(
        git,
        repo,
        &["rev-list", "--parents", "-n", "1", commit_hash],
    )?)
    .trim()
    .to_owned();
    let mut parts = parent_line.split_whitespace();
    let _ = parts.next();
    let first_parent = parts.next();
    let name_status = if let Some(parent) = first_parent {
        run(
            git,
            repo,
            &[
                "diff-tree",
                "--no-commit-id",
                "--name-status",
                "-r",
                "-z",
                "--find-renames",
                parent,
                commit_hash,
            ],
        )?
    } else {
        run(
            git,
            repo,
            &[
                "diff-tree",
                "--root",
                "--no-commit-id",
                "--name-status",
                "-r",
                "-z",
                "--find-renames",
                commit_hash,
            ],
        )?
    };
    parse_name_status(&name_status)
}

pub fn outgoing_commit_diff(
    git: &Path,
    repo: &Path,
    commit_hash: &str,
    path: &str,
) -> Result<CommitDiff, String> {
    // Validate both the outgoing revision and literal file against Git's list.
    let files = outgoing_commit_files(git, repo, commit_hash)?;
    let file = files.iter().find(|file| file.path == path)
        .ok_or("Choose a file from the selected commit.")?;
    let parents = run(git, repo, &["rev-list", "--parents", "-n", "1", commit_hash])?;
    let parent = String::from_utf8_lossy(&parents).split_whitespace().nth(1).map(str::to_owned);
    let mut args = vec!["--literal-pathspecs"];
    if let Some(parent) = &parent {
        args.extend(["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--find-renames", parent.as_str(), commit_hash]);
    } else {
        args.extend(["diff-tree", "--root", "--no-commit-id", "-r", "-p", "--no-ext-diff", "--no-textconv", "--no-color", "--find-renames", commit_hash]);
    }
    args.extend(["--", path]);
    if let Some(original) = &file.original_path { args.push(original); }
    let mut bytes = run(git, repo, &args)?;
    const LIMIT: usize = 512 * 1024;
    let truncated = bytes.len() > LIMIT;
    bytes.truncate(LIMIT);
    Ok(CommitDiff { text: String::from_utf8_lossy(&bytes).into_owned(), truncated, before_revision: parent, after_revision: commit_hash.to_owned() })
}

fn parse_name_status(bytes: &[u8]) -> Result<Vec<CommitFile>, String> {
    let fields: Vec<_> = bytes.split(|byte| *byte == 0).collect();
    let mut files = Vec::new();
    let mut index = 0;
    while index < fields.len() {
        let status = String::from_utf8_lossy(fields[index])
            .trim_matches(['\n', '\r'])
            .to_owned();
        index += 1;
        if status.is_empty() {
            continue;
        }
        let kind = status.chars().next().unwrap_or(' ');
        if matches!(kind, 'R' | 'C') {
            if index + 1 >= fields.len() {
                return Err("Git returned an incomplete rename entry.".into());
            }
            files.push(CommitFile {
                original_path: Some(String::from_utf8_lossy(fields[index]).into_owned()),
                path: String::from_utf8_lossy(fields[index + 1]).into_owned(),
                status,
            });
            index += 2;
        } else {
            let Some(path) = fields.get(index) else {
                return Err("Git returned an incomplete file entry.".into());
            };
            files.push(CommitFile {
                path: String::from_utf8_lossy(path).into_owned(),
                original_path: None,
                status,
            });
            index += 1;
        }
    }
    Ok(files)
}

pub(crate) struct PushPlan {
    pub remote: String,
    pub refspec: String,
    source_branch: String,
    destination_branch: String,
    count: usize,
}

pub(crate) fn push_plan(
    git: &Path,
    repo: &Path,
    expected_head: &str,
    expected_upstream_head: &str,
) -> Result<PushPlan, String> {
    if !matches!(expected_head.len(), 40 | 64)
        || !expected_head.bytes().all(|byte| byte.is_ascii_hexdigit())
        || !matches!(expected_upstream_head.len(), 40 | 64)
        || !expected_upstream_head
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Refresh the push list before pushing.".into());
    }
    let (head, upstream_head, source_branch, upstream, remote, destination_branch) =
        read_upstream(git, repo)?;
    if head != expected_head {
        return Err("The branch changed after this preview. Refresh the push list before pushing.".into());
    }
    if upstream_head != expected_upstream_head {
        return Err("The remote-tracking branch changed after this preview. Fetch and refresh the push list before pushing.".into());
    }
    let state = changes(git, repo)?;
    if state.detached {
        return Err("Select a branch before pushing.".into());
    }
    if state.upstream.is_none() {
        return Err("Configure an upstream before pushing.".into());
    }
    if state.behind.unwrap_or(0) > 0 {
        return Err("The remote has commits you do not have. Fetch and pull before pushing.".into());
    }
    let range = format!("{upstream}..HEAD");
    let count = String::from_utf8_lossy(&run(
        git,
        repo,
        &["rev-list", "--count", range.as_str()],
    )?)
    .trim()
    .parse::<usize>()
    .map_err(|_| "Git returned an invalid outgoing commit count.".to_string())?;
    if count == 0 {
        return Err("There are no commits to push.".into());
    }
    let destination = format!("refs/heads/{destination_branch}");
    let refspec = format!("HEAD:{destination}");
    Ok(PushPlan { remote, refspec, source_branch, destination_branch, count })
}

pub fn push(git: &Path, repo: &Path, expected_head: &str, expected_upstream_head: &str) -> Result<String, String> {
    let plan = push_plan(git, repo, expected_head, expected_upstream_head)?;
    // Check the actual push destination; cached tracking refs may be stale.
    if crate::sync::remote_head(git, repo, &plan.remote, &plan.destination_branch)? != expected_upstream_head {
        let _ = crate::sync::check(git, repo, true);
        return Err(crate::sync::REMOTE_CHANGED.into());
    }
    let PushPlan { remote, refspec, source_branch, destination_branch, count } = push_plan(git, repo, expected_head, expected_upstream_head)?;
    let output = run(
        git,
        repo,
        &["push", "--porcelain", "--", remote.as_str(), refspec.as_str()],
    ).map_err(|error| if crate::sync::is_rejection(&error) { crate::sync::REMOTE_CHANGED.into() } else { error })?;
    let output = String::from_utf8_lossy(&output)
        .trim()
        .chars()
        .take(2000)
        .collect::<String>();
    let summary = format!(
        "Pushed {count} commit(s) from {source_branch} to {remote}:{destination_branch}."
    );
    Ok(if output.is_empty() {
        summary
    } else {
        format!("{summary}\n{output}")
    })
}

pub fn diff(git: &Path, repo: &Path, path: &str, staged: bool) -> Result<Diff, String> {
    let state = changes(git, repo)?;
    let file = state
        .files
        .iter()
        .find(|f| f.path == path)
        .ok_or("File is no longer changed. Refresh the list.")?;
    const LIMIT: usize = 512 * 1024;
    if file.status == "??" {
        let full = repo.join(path);
        let meta = fs::symlink_metadata(&full).map_err(|e| e.to_string())?;
        if meta.file_type().is_symlink() {
            return Ok(Diff {
                text: format!(
                    "New symbolic link → {}",
                    fs::read_link(full).map_err(|e| e.to_string())?.display()
                ),
                truncated: false,
            });
        }
        let mut bytes = vec![];
        fs::File::open(full)
            .map_err(|e| e.to_string())?
            .take((LIMIT + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        let truncated = bytes.len() > LIMIT;
        bytes.truncate(LIMIT);
        let text = if bytes.contains(&0) {
            "Binary file: no text preview available.".into()
        } else {
            format!(
                "--- /dev/null\n+++ b/{path}\n{}",
                String::from_utf8_lossy(&bytes)
                    .lines()
                    .map(|l| format!("+{l}\n"))
                    .collect::<String>()
            )
        };
        return Ok(Diff { text, truncated });
    }
    let mut args = vec![
        "--literal-pathspecs",
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--find-renames",
    ];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(path);
    if let Some(original) = &file.original_path {
        args.push(original);
    }
    let mut bytes = run(git, repo, &args)?;
    let truncated = bytes.len() > LIMIT;
    bytes.truncate(LIMIT);
    Ok(Diff {
        text: String::from_utf8_lossy(&bytes).into_owned(),
        truncated,
    })
}
pub fn action(
    git: &Path,
    repo: &Path,
    action: &str,
    paths: &[String],
    message: Option<&str>,
) -> Result<String, String> {
    let state = changes(git, repo)?;
    match action {
        "stage" | "unstage" => {
            if paths.is_empty() || paths.len() > 10000 {
                return Err("Select files to stage or unstage.".into());
            }
            let mut selected = HashSet::new();
            for path in paths {
                let file = state
                    .files
                    .iter()
                    .find(|f| &f.path == path)
                    .ok_or("A selected file is no longer changed. Refresh and try again.")?;
                selected.insert(file.path.clone());
                if let Some(original) = &file.original_path {
                    selected.insert(original.clone());
                }
            }
            let unborn = run(git, repo, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err();
            let mut args = if action == "stage" {
                vec!["--literal-pathspecs", "add", "--"]
            } else if unborn {
                vec![
                    "--literal-pathspecs",
                    "rm",
                    "--cached",
                    "-r",
                    "--ignore-unmatch",
                    "--",
                ]
            } else {
                vec!["--literal-pathspecs", "reset", "-q", "HEAD", "--"]
            };
            args.extend(selected.iter().map(String::as_str));
            run(git, repo, &args)?;
            Ok(format!(
                "{} {} file(s).",
                if action == "stage" {
                    "Staged"
                } else {
                    "Unstaged"
                },
                paths.len()
            ))
        }
        "commit" => {
            let message = message
                .filter(|m| !m.trim().is_empty())
                .ok_or("Enter a commit message.")?;
            if message.len() > 65536 {
                return Err("The commit message is too long.".into());
            }
            if state.staged == 0 {
                return Err("Stage files before committing.".into());
            }
            if state.conflicts > 0 {
                return Err("Resolve and stage all conflicts before committing.".into());
            }
            run(git, repo, &["commit", "-m", message])?;
            let hash = run(git, repo, &["rev-parse", "--short", "HEAD"])?;
            Ok(format!(
                "Created commit {}.",
                String::from_utf8_lossy(&hash).trim()
            ))
        }
        "pull" => {
            if state.changed > 0 {
                return Err("Skipped: commit or stash local changes before pulling.".into());
            }
            if state.detached {
                return Err("Skipped: select a branch before pulling.".into());
            }
            if state.upstream.is_none() {
                return Err("Skipped: configure an upstream before pulling.".into());
            }
            let output = run(
                git,
                repo,
                &["pull", "--ff-only", "--no-rebase", "--no-edit"],
            )?;
            Ok(String::from_utf8_lossy(&output)
                .trim()
                .chars()
                .take(2000)
                .collect())
        }
        _ => Err("Unsupported Git action.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::find_git;
    fn exec(git: &Path, repo: &Path, args: &[&str]) {
        run(git, repo, args).unwrap();
    }
    fn setup(repo: &Path, git: &Path) {
        exec(git, repo, &["init", "-q", "-b", "main"]);
        exec(git, repo, &["config", "user.name", "Demo"]);
        exec(git, repo, &["config", "user.email", "demo@example.com"]);
        exec(git, repo, &["config", "commit.gpgsign", "false"]);
    }
    fn push_fixture() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf, std::path::PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let local = root.path().join("local");
        let remote = root.path().join("remote.git");
        let (git, _) = find_git().unwrap();
        fs::create_dir(&local).unwrap(); setup(&local, &git);
        exec(&git, root.path(), &["init", "--bare", "-q", remote.to_str().unwrap()]);
        fs::write(local.join("original.txt"), "original\n").unwrap();
        action(&git, &local, "stage", &["original.txt".into()], None).unwrap();
        action(&git, &local, "commit", &[], Some("Initial")).unwrap();
        exec(&git, &local, &["remote", "add", "origin", remote.to_str().unwrap()]);
        exec(&git, &local, &["push", "-qu", "origin", "HEAD:published"]);
        (root, git, local, remote)
    }
    #[test]
    fn outgoing_rename_files_and_push_to_tracked_destination() {
        let (_root, git, local, remote) = push_fixture();
        exec(&git, &local, &["mv", "original.txt", "renamed.txt"]);
        action(&git, &local, "commit", &[], Some("Rename file")).unwrap();
        fs::write(local.join("private.txt"), "keep locally").unwrap();
        let preview = outgoing(&git, &local).unwrap();
        assert_eq!(preview.destination_branch, "published");
        assert_eq!(preview.source_branch, "main");
        assert_eq!(preview.total_commits, 1);
        let files = outgoing_commit_files(&git, &local, &preview.head).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "renamed.txt");
        assert_eq!(files[0].original_path.as_deref(), Some("original.txt"));
        assert!(push(&git, &local, &preview.head, &preview.upstream_head).unwrap().contains("origin:published"));
        assert_eq!(outgoing(&git, &local).unwrap().total_commits, 0);
        let remote_head = String::from_utf8_lossy(&run(&git, &remote, &["rev-parse", "refs/heads/published"]).unwrap()).trim().to_owned();
        assert_eq!(remote_head, preview.head);
        assert_eq!(fs::read_to_string(local.join("private.txt")).unwrap(), "keep locally");
        assert!(run(&git, &remote, &["show", "published:private.txt"]).is_err());
    }
    #[test]
    fn outgoing_diff_uses_committed_content_and_literal_paths() {
        let (_root, git, local, _remote) = push_fixture();
        fs::write(local.join("original.txt"), "committed change\n").unwrap();
        fs::write(local.join("[literal].txt"), "literal addition\n").unwrap();
        fs::write(local.join("binary.dat"), [0, 1, 2]).unwrap();
        action(&git, &local, "stage", &["original.txt".into(), "[literal].txt".into(), "binary.dat".into()], None).unwrap();
        action(&git, &local, "commit", &[], Some("Committed changes")).unwrap();
        let preview = outgoing(&git, &local).unwrap();
        fs::write(local.join("original.txt"), "uncommitted content\n").unwrap();
        action(&git, &local, "stage", &["original.txt".into()], None).unwrap();
        fs::write(local.join("original.txt"), "working tree content\n").unwrap();
        let diff = outgoing_commit_diff(&git, &local, &preview.head, "original.txt").unwrap();
        assert!(diff.text.contains("-original") && diff.text.contains("+committed change"));
        assert!(!diff.text.contains("uncommitted") && !diff.text.contains("working tree"));
        assert_eq!(diff.before_revision.as_deref(), Some(preview.upstream_head.as_str()));
        assert_eq!(diff.after_revision, preview.head);
        assert!(!diff.truncated);
        assert!(outgoing_commit_diff(&git, &local, &preview.head, "[literal].txt").unwrap().text.contains("+literal addition"));
        assert!(outgoing_commit_diff(&git, &local, &preview.head, "binary.dat").unwrap().text.contains("Binary files"));
        assert!(outgoing_commit_diff(&git, &local, "--bad-option", "original.txt").is_err());
        assert!(outgoing_commit_diff(&git, &local, &preview.upstream_head, "original.txt").is_err());
        assert!(outgoing_commit_diff(&git, &local, &preview.head, "../outside").is_err());
        assert!(outgoing_commit_diff(&git, &local, &preview.head, ":(glob)*").is_err());
        assert_eq!(fs::read_to_string(local.join("original.txt")).unwrap(), "working tree content\n");
        assert!(String::from_utf8_lossy(&run(&git, &local, &["show", ":original.txt"]).unwrap()).contains("uncommitted content"));
    }
    #[test]
    fn outgoing_diff_handles_rename_deletion_and_truncation() {
        let (_root, git, local, _remote) = push_fixture();
        exec(&git, &local, &["mv", "original.txt", "renamed.txt"]);
        action(&git, &local, "commit", &[], Some("Rename")).unwrap();
        let renamed = outgoing(&git, &local).unwrap();
        let diff = outgoing_commit_diff(&git, &local, &renamed.head, "renamed.txt").unwrap();
        assert!(diff.text.contains("rename from original.txt") && diff.text.contains("rename to renamed.txt"));
        exec(&git, &local, &["rm", "renamed.txt"]);
        fs::write(local.join("large.txt"), "x".repeat(512 * 1024 + 20)).unwrap();
        action(&git, &local, "stage", &["large.txt".into()], None).unwrap();
        action(&git, &local, "commit", &[], Some("Delete and add large file")).unwrap();
        let deleted = outgoing(&git, &local).unwrap();
        let diff = outgoing_commit_diff(&git, &local, &deleted.head, "renamed.txt").unwrap();
        assert!(diff.text.contains("+++ /dev/null") && diff.text.contains("-original"));
        let large = outgoing_commit_diff(&git, &local, &deleted.head, "large.txt").unwrap();
        assert!(large.truncated && large.text.len() == 512 * 1024);
        // A later commit does not change the preview of the earlier rename.
        assert!(outgoing_commit_diff(&git, &local, &renamed.head, "renamed.txt").unwrap().text.contains("rename from original.txt"));
    }
    #[test]
    fn outgoing_diff_compares_merges_to_first_parent_and_supports_root() {
        let (_root, git, local, _remote) = push_fixture();
        exec(&git, &local, &["checkout", "-qb", "feature"]);
        fs::write(local.join("feature.txt"), "feature content\n").unwrap();
        action(&git, &local, "stage", &["feature.txt".into()], None).unwrap();
        action(&git, &local, "commit", &[], Some("Feature")).unwrap();
        exec(&git, &local, &["checkout", "-q", "main"]);
        exec(&git, &local, &["commit", "--allow-empty", "-qm", "Main"]);
        let first_parent = outgoing(&git, &local).unwrap().head;
        exec(&git, &local, &["merge", "--no-ff", "-qm", "Merge feature", "feature"]);
        let merged = outgoing(&git, &local).unwrap();
        let diff = outgoing_commit_diff(&git, &local, &merged.head, "feature.txt").unwrap();
        assert_eq!(diff.before_revision.as_deref(), Some(first_parent.as_str()));
        assert!(diff.text.contains("+feature content"));
        exec(&git, &local, &["checkout", "--orphan", "fresh"]);
        exec(&git, &local, &["rm", "-rf", "."]);
        fs::write(local.join("root.txt"), "root content\n").unwrap();
        action(&git, &local, "stage", &["root.txt".into()], None).unwrap();
        action(&git, &local, "commit", &[], Some("Root")).unwrap();
        exec(&git, &local, &["branch", "--set-upstream-to", "origin/published"]);
        let root = outgoing(&git, &local).unwrap();
        let diff = outgoing_commit_diff(&git, &local, &root.head, "root.txt").unwrap();
        assert!(diff.before_revision.is_none() && diff.text.contains("+root content"));
    }
    #[test]
    fn push_refuses_a_changed_branch_tip_after_review() {
        let (_root, git, local, remote) = push_fixture();
        exec(&git, &local, &["commit", "--allow-empty", "-qm", "Reviewed"]);
        let preview = outgoing(&git, &local).unwrap();
        exec(&git, &local, &["commit", "--allow-empty", "-qm", "Unreviewed"]);
        assert!(push(&git, &local, &preview.head, &preview.upstream_head).unwrap_err().contains("branch changed"));
        assert_eq!(String::from_utf8_lossy(&run(&git, &remote, &["rev-parse", "published"]).unwrap()).trim(), preview.upstream_head);
        assert!(outgoing_commit_files(&git, &local, "--bad-option").is_err());
    }
    #[test]
    fn push_never_overwrites_remote_commits_and_rejects_a_stale_tracking_ref() {
        let (root, git, local, remote) = push_fixture();
        let peer = root.path().join("peer");
        exec(&git, root.path(), &["clone", "-q", "-b", "published", remote.to_str().unwrap(), peer.to_str().unwrap()]);
        exec(&git, &peer, &["config", "user.name", "Demo"]);
        exec(&git, &peer, &["config", "user.email", "demo@example.com"]);
        exec(&git, &peer, &["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", "Peer update"]);
        exec(&git, &peer, &["push", "-q"]);
        exec(&git, &local, &["commit", "--allow-empty", "-qm", "Local update"]);
        let preview = outgoing(&git, &local).unwrap();
        assert!(push(&git, &local, &preview.head, &preview.upstream_head).is_err());
        exec(&git, &local, &["fetch", "-q", "origin"]);
        assert!(push(&git, &local, &preview.head, &preview.upstream_head).unwrap_err().contains("remote-tracking branch changed"));
        assert_eq!(String::from_utf8_lossy(&run(&git, &remote, &["log", "-1", "--format=%s", "published"]).unwrap()).trim(), "Peer update");
    }
    #[test]
    fn staging_unborn_literal_names_partial_index_and_commit() {
        let root = tempfile::tempdir().unwrap();
        let repo = root.path();
        let (git, _) = find_git().unwrap();
        setup(repo, &git);
        fs::write(repo.join("[literal].txt"), "first\n").unwrap();
        fs::write(repo.join("other.txt"), "keep\n").unwrap();
        let paths = vec!["[literal].txt".into()];
        action(&git, repo, "stage", &paths, None).unwrap();
        assert_eq!(changes(&git, repo).unwrap().staged, 1);
        action(&git, repo, "unstage", &paths, None).unwrap();
        assert!(repo.join("[literal].txt").exists());
        assert_eq!(changes(&git, repo).unwrap().staged, 0);
        action(&git, repo, "stage", &paths, None).unwrap();
        fs::write(repo.join("[literal].txt"), "second\n").unwrap();
        assert!(diff(&git, repo, "[literal].txt", true)
            .unwrap()
            .text
            .contains("+first"));
        assert!(diff(&git, repo, "[literal].txt", false)
            .unwrap()
            .text
            .contains("+second"));
        action(&git, repo, "commit", &[], Some("Initial selected file")).unwrap();
        assert!(changes(&git, repo)
            .unwrap()
            .files
            .iter()
            .any(|f| f.path == "other.txt" && f.status == "??"));
        assert!(action(&git, repo, "stage", &["../outside.txt".into()], None).is_err());
        assert!(action(&git, repo, "commit", &[], Some("Nothing staged")).is_err());
        assert_eq!(
            fs::read_to_string(repo.join("[literal].txt")).unwrap(),
            "second\n"
        );
    }
    #[test]
    fn untracked_nested_files_and_rename_unstage() {
        let root = tempfile::tempdir().unwrap();
        let repo = root.path();
        let (git, _) = find_git().unwrap();
        setup(repo, &git);
        fs::create_dir(repo.join("new")).unwrap();
        fs::write(repo.join("new/one.txt"), "one\n").unwrap();
        fs::write(repo.join("new/two.txt"), "two\n").unwrap();
        assert_eq!(changes(&git, repo).unwrap().untracked, 2);
        assert!(diff(&git, repo, "new/one.txt", false)
            .unwrap()
            .text
            .contains("+one"));
        action(&git, repo, "stage", &["new/one.txt".into()], None).unwrap();
        action(&git, repo, "commit", &[], Some("Add one")).unwrap();
        exec(&git, repo, &["mv", "new/one.txt", "new/renamed.txt"]);
        action(&git, repo, "unstage", &["new/renamed.txt".into()], None).unwrap();
        assert_eq!(changes(&git, repo).unwrap().staged, 0);
        assert!(repo.join("new/renamed.txt").exists());
    }
    #[test]
    fn pull_fast_forward_and_refuse_dirty_or_divergent_work() {
        let root = tempfile::tempdir().unwrap();
        let remote = root.path().join("remote.git");
        let local = root.path().join("local");
        let peer = root.path().join("peer");
        fs::create_dir(&local).unwrap();
        let (git, _) = find_git().unwrap();
        setup(&local, &git);
        exec(
            &git,
            root.path(),
            &["init", "--bare", "-q", remote.to_str().unwrap()],
        );
        fs::write(local.join("file.txt"), "initial").unwrap();
        action(&git, &local, "stage", &["file.txt".into()], None).unwrap();
        action(&git, &local, "commit", &[], Some("Initial")).unwrap();
        exec(
            &git,
            &local,
            &["remote", "add", "origin", remote.to_str().unwrap()],
        );
        exec(&git, &local, &["push", "-qu", "origin", "main"]);
        exec(
            &git,
            root.path(),
            &[
                "clone",
                "-q",
                "-b",
                "main",
                remote.to_str().unwrap(),
                peer.to_str().unwrap(),
            ],
        );
        setup(&peer, &git);
        fs::write(peer.join("file.txt"), "updated").unwrap();
        action(&git, &peer, "stage", &["file.txt".into()], None).unwrap();
        action(&git, &peer, "commit", &[], Some("Peer update")).unwrap();
        exec(&git, &peer, &["push", "-q"]);
        fs::write(local.join("private.txt"), "keep").unwrap();
        assert!(action(&git, &local, "pull", &[], None)
            .unwrap_err()
            .starts_with("Skipped:"));
        fs::remove_file(local.join("private.txt")).unwrap();
        action(&git, &local, "pull", &[], None).unwrap();
        assert_eq!(
            fs::read_to_string(local.join("file.txt")).unwrap(),
            "updated"
        );
        exec(
            &git,
            &local,
            &["commit", "--allow-empty", "-qm", "Local branch"],
        );
        exec(
            &git,
            &peer,
            &["commit", "--allow-empty", "-qm", "Peer branch"],
        );
        exec(&git, &peer, &["push", "-q"]);
        assert!(action(&git, &local, "pull", &[], None).is_err());
        assert_eq!(
            String::from_utf8_lossy(&run(&git, &local, &["log", "-1", "--format=%s"]).unwrap())
                .trim(),
            "Local branch"
        );
    }
}
