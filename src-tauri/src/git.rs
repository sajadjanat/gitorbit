use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "vendor",
    ".idea",
    ".vscode",
    ".next",
    ".nuxt",
    ".cache",
    "dist",
    "build",
    "coverage",
    ".venv",
    "venv",
    "target",
    ".output",
    ".codex",
    ".codex-tmp",
    ".agents",
    ".cursor",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub auto_fetch: bool,
}

pub fn relevant_event(path: &Path, root: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };
    let parts: Vec<_> = relative
        .components()
        .map(|p| p.as_os_str().to_string_lossy())
        .collect();
    for (index, part) in parts.iter().enumerate() {
        if part == ".git" {
            return !parts
                .get(index + 1)
                .is_some_and(|s| ["objects", "logs", "hooks"].contains(&s.as_ref()));
        }
        if SKIP_DIRS.contains(&part.as_ref()) {
            return false;
        }
    }
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub path: String,
    pub name: String,
    pub branch: String,
    pub upstream: Option<String>,
    pub changed: usize,
    pub staged: usize,
    pub unstaged: usize,
    pub untracked: usize,
    pub conflicts: usize,
    pub ahead: Option<u64>,
    pub behind: Option<u64>,
    pub detached: bool,
    pub files: Vec<ChangedFile>,
    pub error: Option<String>,
    pub fetch_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub workspace_id: String,
    pub repositories: Vec<Repository>,
    pub scanned_at: u64,
    pub fetched_at: Option<u64>,
    pub diagnostics: Vec<String>,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd
}

pub fn capture(mut cmd: Command, timeout: Duration) -> Result<Vec<u8>, String> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Could not capture command output")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Could not capture command errors")?;
    let read = |stream: Box<dyn Read + Send>| {
        thread::spawn(move || {
            let mut bytes = Vec::new();
            stream
                .take(32 * 1024 * 1024)
                .read_to_end(&mut bytes)
                .map(|_| bytes)
        })
    };
    let output = read(Box::new(stdout));
    let errors = read(Box::new(stderr));
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(25)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err("Command timed out. Check remote access and try again.".to_string());
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(e.to_string());
            }
        }
    }?;
    let bytes = output
        .join()
        .map_err(|_| "Output reader failed")?
        .map_err(|e| e.to_string())?;
    let error = errors
        .join()
        .map_err(|_| "Error reader failed")?
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(bytes)
    } else {
        let message = String::from_utf8_lossy(&error).trim().to_string();
        Err(if message.is_empty() {
            format!("Command exited with {status}")
        } else {
            message.chars().take(1200).collect()
        })
    }
}

pub fn git_command(executable: &Path, repo: &Path) -> Command {
    let mut cmd = command(executable);
    cmd.args([
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.quotePath=false",
        "-C",
    ])
    .arg(repo)
    .env("GIT_TERMINAL_PROMPT", "0")
    .env("GCM_INTERACTIVE", "Never")
    .env_remove("GIT_DIR")
    .env_remove("GIT_WORK_TREE")
    .env_remove("GIT_INDEX_FILE");
    cmd
}

pub fn executable(name: &str) -> Option<PathBuf> {
    env::var_os("PATH")
        .into_iter()
        .flat_map(|p| env::split_paths(&p).collect::<Vec<_>>())
        .map(|dir| {
            dir.join(if cfg!(windows) {
                format!("{name}.exe")
            } else {
                name.into()
            })
        })
        .find(|p| p.is_file())
}

pub fn find_git() -> Option<(PathBuf, String)> {
    let mut candidates = Vec::new();
    if let Some(path) = executable("git") {
        candidates.push(path);
    }
    #[cfg(windows)]
    for base in [
        env::var_os("ProgramFiles"),
        env::var_os("ProgramFiles(x86)"),
        env::var_os("LOCALAPPDATA"),
    ]
    .into_iter()
    .flatten()
    {
        candidates.push(PathBuf::from(&base).join("Git/cmd/git.exe"));
        candidates.push(PathBuf::from(base).join("Programs/Git/cmd/git.exe"));
    }
    #[cfg(target_os = "macos")]
    {
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/git"),
            PathBuf::from("/usr/local/bin/git"),
        ]);
        let mut xcode = command("/usr/bin/xcode-select");
        xcode.arg("-p");
        let tools = capture(xcode, Duration::from_secs(3)).is_ok();
        if !tools {
            candidates.retain(|p| p != Path::new("/usr/bin/git"));
        }
        if tools {
            candidates.push(PathBuf::from("/usr/bin/git"));
        }
    }
    #[cfg(target_os = "linux")]
    candidates.push(PathBuf::from("/usr/bin/git"));
    for path in candidates {
        if !path.is_file() {
            continue;
        }
        let mut cmd = command(&path);
        cmd.arg("--version");
        if let Ok(version) = capture(cmd, Duration::from_secs(4)) {
            return Some((path, String::from_utf8_lossy(&version).trim().into()));
        }
    }
    None
}

pub fn discover(root: &Path) -> (Vec<PathBuf>, Vec<String>) {
    let mut pending = vec![root.to_path_buf()];
    let mut repos = Vec::new();
    let mut errors = Vec::new();
    while let Some(dir) = pending.pop() {
        if dir.join(".git").exists() {
            repos.push(dir);
            continue;
        }
        let children = match fs::read_dir(&dir) {
            Ok(c) => c,
            Err(e) => {
                errors.push(format!("{}: {e}", dir.display()));
                continue;
            }
        };
        for child in children {
            match child {
                Ok(child) => {
                    if SKIP_DIRS.contains(&child.file_name().to_string_lossy().as_ref()) {
                        continue;
                    }
                    if child
                        .file_type()
                        .map(|k| k.is_dir() && !k.is_symlink())
                        .unwrap_or(false)
                    {
                        pending.push(child.path());
                    }
                }
                Err(e) => errors.push(e.to_string()),
            }
        }
    }
    repos.sort();
    (repos, errors)
}

pub fn parse_status(bytes: &[u8]) -> Result<Repository, String> {
    let mut repo = Repository::default();
    let mut records = bytes.split(|b| *b == 0);
    while let Some(record) = records.next() {
        if record.is_empty() {
            continue;
        }
        let line = String::from_utf8_lossy(record);
        if let Some(v) = line.strip_prefix("# branch.head ") {
            repo.branch = v.into();
            repo.detached = v == "(detached)";
        } else if let Some(v) = line.strip_prefix("# branch.upstream ") {
            repo.upstream = Some(v.into());
        } else if let Some(v) = line.strip_prefix("# branch.ab ") {
            let parts: Vec<_> = v.split_whitespace().collect();
            repo.ahead = parts
                .first()
                .and_then(|v| v.strip_prefix('+'))
                .and_then(|v| v.parse().ok());
            repo.behind = parts
                .get(1)
                .and_then(|v| v.strip_prefix('-'))
                .and_then(|v| v.parse().ok());
        } else if line.starts_with('#') {
            continue;
        } else if let Some(path) = line.strip_prefix("? ") {
            repo.untracked += 1;
            repo.files.push(ChangedFile {
                path: path.into(),
                original_path: None,
                status: "??".into(),
            });
        } else {
            let (fields, rename, conflict) = match line.as_bytes()[0] {
                b'1' => (9, false, false),
                b'2' => (10, true, false),
                b'u' => (11, false, true),
                _ => return Err("Unsupported Git status record".into()),
            };
            let parts: Vec<_> = line.splitn(fields, ' ').collect();
            if parts.len() != fields || parts[1].len() != 2 {
                return Err("Invalid Git status record".into());
            }
            let status = parts[1];
            if status.as_bytes()[0] != b'.' {
                repo.staged += 1;
            }
            if status.as_bytes()[1] != b'.' {
                repo.unstaged += 1;
            }
            if conflict {
                repo.conflicts += 1;
            }
            let original_path = if rename {
                Some(
                    String::from_utf8_lossy(records.next().ok_or("Missing original rename path")?)
                        .into(),
                )
            } else {
                None
            };
            repo.files.push(ChangedFile {
                path: parts[fields - 1].into(),
                original_path,
                status: status.replace('.', " "),
            });
        }
    }
    repo.changed = repo.files.len();
    if repo.branch.is_empty() {
        return Err("Git did not return branch information".into());
    }
    Ok(repo)
}

pub fn scan(
    workspace: &Workspace,
    git: &Path,
    fetch: bool,
    previous: &HashMap<String, String>,
    fetched_at: Option<u64>,
) -> Snapshot {
    let root = Path::new(&workspace.path);
    let (paths, diagnostics) = discover(root);
    let mut repositories = Vec::new();
    for batch in paths.chunks(4) {
        repositories.extend(thread::scope(|scope| {
            let handles: Vec<_> = batch
                .iter()
                .map(|path| {
                    scope.spawn(move || {
                        let path_string = path.to_string_lossy().to_string();
                        let name = path
                            .strip_prefix(root)
                            .ok()
                            .filter(|p| !p.as_os_str().is_empty())
                            .map(|p| p.to_string_lossy().replace('\\', "/"))
                            .unwrap_or_else(|| workspace.name.clone());
                        let fetch_error = if fetch {
                            let mut cmd = git_command(git, path);
                            cmd.args(["fetch", "--all", "--quiet"]);
                            capture(cmd, Duration::from_secs(30)).err()
                        } else {
                            previous.get(&path_string).cloned()
                        };
                        let mut cmd = git_command(git, path);
                        cmd.args([
                            "status",
                            "--porcelain=v2",
                            "--branch",
                            "-z",
                            "--untracked-files=all",
                        ]);
                        let result = capture(cmd, Duration::from_secs(12))
                            .and_then(|bytes| parse_status(&bytes));
                        let mut repo = match result {
                            Ok(repo) => repo,
                            Err(e) => Repository {
                                error: Some(e),
                                branch: "Unknown".into(),
                                ..Default::default()
                            },
                        };
                        repo.path = path_string;
                        repo.name = name;
                        repo.fetch_error = fetch_error;
                        repo
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|h| h.join().expect("repository scan panicked"))
                .collect::<Vec<_>>()
        }));
    }
    Snapshot {
        workspace_id: workspace.id.clone(),
        repositories,
        scanned_at: now_ms(),
        fetched_at: if fetch { Some(now_ms()) } else { fetched_at },
        diagnostics,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn watcher_filters_dependency_noise_but_tracks_git_metadata() {
        let root = Path::new("workspace");
        assert!(!relevant_event(
            &root.join("node_modules/package/index.js"),
            root
        ));
        assert!(!relevant_event(
            &root.join("app/.git/objects/aa/file"),
            root
        ));
        assert!(relevant_event(
            &root.join("app/.git/refs/remotes/origin/main"),
            root
        ));
        assert!(relevant_event(&root.join("app/.git/index"), root));
        assert!(relevant_event(&root.join("app/src/new.ts"), root));
    }
    fn run_git(git: &Path, folder: &Path, args: &[&str]) {
        let mut cmd = git_command(git, folder);
        cmd.args([
            "-c",
            "user.name=Monitor Test",
            "-c",
            "user.email=monitor@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.hooksPath=nonexistent-test-hooks",
        ])
        .args(args);
        capture(cmd, Duration::from_secs(10)).unwrap();
    }
    #[test]
    fn fetch_updates_diverged_counts_and_retains_failures() {
        let (git, _) = find_git().expect("Git required for integration test");
        let root = tempfile::tempdir().unwrap();
        let remote = root.path().join("remote.git");
        let local = root.path().join("local");
        let peer = root.path().join("peer");
        run_git(
            &git,
            root.path(),
            &["init", "--bare", "--quiet", remote.to_str().unwrap()],
        );
        run_git(
            &git,
            root.path(),
            &[
                "init",
                "--quiet",
                "--initial-branch=main",
                local.to_str().unwrap(),
            ],
        );
        fs::write(local.join("base.txt"), "base").unwrap();
        run_git(&git, &local, &["add", "."]);
        run_git(&git, &local, &["commit", "-qm", "Initial"]);
        run_git(
            &git,
            &local,
            &["remote", "add", "origin", remote.to_str().unwrap()],
        );
        run_git(&git, &local, &["push", "-qu", "origin", "main"]);
        run_git(
            &git,
            root.path(),
            &[
                "clone",
                "--quiet",
                "--branch",
                "main",
                remote.to_str().unwrap(),
                peer.to_str().unwrap(),
            ],
        );
        fs::write(local.join("local.txt"), "local").unwrap();
        run_git(&git, &local, &["add", "."]);
        run_git(&git, &local, &["commit", "-qm", "Local"]);
        fs::write(peer.join("peer.txt"), "peer").unwrap();
        run_git(&git, &peer, &["add", "."]);
        run_git(&git, &peer, &["commit", "-qm", "Peer"]);
        run_git(&git, &peer, &["push", "-q"]);
        let w = Workspace {
            id: "test".into(),
            name: "test".into(),
            path: local.to_string_lossy().into(),
            auto_fetch: false,
        };
        let synced = scan(&w, &git, true, &HashMap::new(), None);
        assert_eq!(
            (synced.repositories[0].ahead, synced.repositories[0].behind),
            (Some(1), Some(1))
        );
        assert_eq!(synced.repositories[0].changed, 0);
        run_git(
            &git,
            &local,
            &[
                "remote",
                "set-url",
                "origin",
                root.path().join("missing.git").to_str().unwrap(),
            ],
        );
        let failed = scan(&w, &git, true, &HashMap::new(), None);
        let r = &failed.repositories[0];
        assert!(r.fetch_error.is_some());
        assert!(r.error.is_none());
        let previous = HashMap::from([(r.path.clone(), r.fetch_error.clone().unwrap())]);
        assert_eq!(
            scan(&w, &git, false, &previous, failed.fetched_at).repositories[0].fetch_error,
            r.fetch_error
        );
        run_git(
            &git,
            &local,
            &["remote", "set-url", "origin", remote.to_str().unwrap()],
        );
        assert!(
            scan(&w, &git, true, &previous, failed.fetched_at).repositories[0]
                .fetch_error
                .is_none()
        );
    }
    #[test]
    fn overlapping_changes_and_remote_counts() {
        let r = parse_status(
            b"# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -4\0\
            1 MM N... 100644 100644 100644 abc abc file with spaces.ts\0? new folder/\0",
        )
        .unwrap();
        assert_eq!((r.changed, r.staged, r.unstaged, r.untracked), (2, 1, 1, 1));
        assert_eq!((r.ahead, r.behind), (Some(2), Some(4)));
        assert_eq!(r.files[0].path, "file with spaces.ts");
    }
    #[test]
    fn rename_has_one_entry() {
        let r = parse_status(
            b"# branch.head main\0\
            2 R. N... 100644 100644 100644 abc abc R100 new name\0old name\0",
        )
        .unwrap();
        assert_eq!(r.changed, 1);
        assert_eq!(r.files[0].original_path.as_deref(), Some("old name"));
    }
    #[test]
    fn unknown_upstream_and_detached_are_distinct() {
        let r = parse_status(b"# branch.head (detached)\0").unwrap();
        assert!(r.detached);
        assert_eq!(r.ahead, None);
        assert_eq!(r.upstream, None);
    }
    #[test]
    fn conflict_and_unicode() {
        let r = parse_status("# branch.head main\0u UU N... 100644 100644 100644 100644 abc abc abc conflict.txt\0? متن.txt\0".as_bytes()).unwrap();
        assert_eq!(r.conflicts, 1);
        assert_eq!(r.files[1].path, "متن.txt");
    }
    #[test]
    fn discovery_handles_worktrees_and_ignores_dependencies() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("first/nested/.git")).unwrap();
        fs::create_dir_all(root.path().join("first/.git")).unwrap();
        fs::create_dir_all(root.path().join("node_modules/fixture/.git")).unwrap();
        fs::create_dir(root.path().join("worktree")).unwrap();
        fs::write(root.path().join("worktree/.git"), "gitdir: elsewhere").unwrap();
        let (repos, errors) = discover(root.path());
        assert_eq!(repos.len(), 2);
        assert!(errors.is_empty());
    }
    #[test]
    fn real_git_respects_ignore() {
        let (git, _) = find_git().expect("Git required for integration test");
        let root = tempfile::tempdir().unwrap();
        let mut init = command(&git);
        init.args(["init", "--quiet", "--initial-branch=main"])
            .arg(root.path());
        capture(init, Duration::from_secs(10)).unwrap();
        fs::write(root.path().join(".gitignore"), ".idea/\n").unwrap();
        fs::create_dir(root.path().join(".idea")).unwrap();
        fs::write(root.path().join(".idea/php.xml"), "ignored").unwrap();
        fs::write(root.path().join("new.txt"), "new").unwrap();
        fs::create_dir(root.path().join("new folder")).unwrap();
        fs::write(root.path().join("new folder/one.txt"), "one").unwrap();
        fs::write(root.path().join("new folder/two.txt"), "two").unwrap();
        let w = Workspace {
            id: "test".into(),
            name: "test".into(),
            path: root.path().to_string_lossy().into(),
            auto_fetch: false,
        };
        let s = scan(&w, &git, false, &HashMap::new(), None);
        assert_eq!(s.repositories.len(), 1);
        assert_eq!(s.repositories[0].changed, 4);
        assert_eq!(s.repositories[0].changed, crate::version_control::changes(&git, root.path()).unwrap().changed);
        assert!(s.repositories[0].error.is_none());
        assert!(s.repositories[0]
            .files
            .iter()
            .all(|f| !f.path.starts_with(".idea")));
    }
}
