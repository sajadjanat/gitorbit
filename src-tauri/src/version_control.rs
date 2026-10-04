use crate::git::{capture, git_command, parse_status, Repository};
use serde::Serialize;
use std::{collections::HashSet, fs, io::Read, path::Path, time::Duration};

fn run(git: &Path, repo: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
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
