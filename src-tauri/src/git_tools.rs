use crate::{git, version_control::{self, run}};
use serde::{Deserialize, Serialize};
use std::{collections::hash_map::DefaultHasher, hash::{Hash, Hasher}, io::Read, path::{Path, PathBuf}};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reference { pub name: String, pub hash: String, pub kind: String, pub upstream: String, pub current: bool }
#[derive(Serialize)]
pub struct Entry { pub id: String, pub hash: String, pub subject: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsState {
    pub review_token: String, pub head: String, pub branch: String, pub operation: Option<String>,
    pub changed: usize, pub conflicts: usize, pub refs: Vec<Reference>, pub stashes: Vec<Entry>, pub reflog: Vec<Entry>, pub remotes: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub action: String, pub target: String, pub name: String, pub paths: Vec<String>,
    pub mode: String, pub force: bool, pub checkout: bool, pub review_token: String,
}
fn text(git: &Path, repo: &Path, args: &[&str]) -> Result<String, String> {
    Ok(String::from_utf8_lossy(&run(git, repo, args)?).trim().to_owned())
}
fn git_path(git: &Path, repo: &Path, name: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(text(git, repo, &["rev-parse", "--git-path", name])?);
    Ok(if p.is_absolute() { p } else { repo.join(p) })
}
fn operation(git: &Path, repo: &Path) -> Result<Option<String>, String> {
    for (marker, name) in [("rebase-merge", "rebase"), ("rebase-apply", "rebase"), ("MERGE_HEAD", "merge"), ("CHERRY_PICK_HEAD", "cherry-pick"), ("REVERT_HEAD", "revert"), ("sequencer", "cherry-pick")] {
        if git_path(git, repo, marker)?.exists() { return Ok(Some(name.into())); }
    }
    Ok(None)
}
fn entries(bytes: &str) -> Vec<Entry> {
    bytes.lines().filter_map(|line| { let mut p = line.splitn(3, '\t'); Some(Entry { id: p.next()?.into(), hash: p.next()?.into(), subject: p.next()?.into() }) }).collect()
}
pub fn inspect(git: &Path, repo: &Path) -> Result<ToolsState, String> {
    let status = version_control::changes(git, repo)?;
    let head = text(git, repo, &["rev-parse", "--verify", "HEAD"]).unwrap_or_default();
    let refs_text = String::from_utf8_lossy(&run(git, repo, &["for-each-ref", "--sort=refname", "--format=%(refname)%09%(objectname)%09%(upstream)%09%(HEAD)%09%(symref)", "refs/heads", "refs/remotes", "refs/tags", "refs/gitorbit/recovery"])?).into_owned();
    let refs = refs_text.lines().filter_map(|line| {
        let p: Vec<_> = line.split('\t').collect(); if p.len() < 5 || !p[4].is_empty() { return None; }
        let kind = if p[0].starts_with("refs/heads/") { "local" } else if p[0].starts_with("refs/remotes/") { "remote" } else if p[0].starts_with("refs/tags/") { "tag" } else { "recovery" };
        Some(Reference { name: p[0].into(), hash: p[1].into(), upstream: p[2].into(), current: p[3] == "*", kind: kind.into() })
    }).collect();
    let stashes_text = text(git, repo, &["stash", "list", "--format=%gd%x09%H%x09%gs"])?;
    let reflog = entries(&text(git, repo, &["reflog", "--max-count=100", "--format=%gd%x09%H%x09%gs"]).unwrap_or_default());
    let operation = operation(git, repo)?;
    let mut identity = DefaultHasher::new();
    (&head, &status.branch, &refs_text, &stashes_text, &operation).hash(&mut identity);
    run(git, repo, &["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"])?.hash(&mut identity);
    run(git, repo, &["diff", "--binary", "--no-ext-diff", "--no-textconv"])?.hash(&mut identity);
    run(git, repo, &["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv"])?.hash(&mut identity);
    // Status alone does not detect edits to an already modified/untracked file.
    for file in &status.files {
        let path = repo.join(&file.path);
        if path.is_file() && !path.is_symlink() {
            file.path.hash(&mut identity);
            let mut input = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            let mut buffer = [0u8; 65536];
            loop { let count = input.read(&mut buffer).map_err(|e| e.to_string())?; if count == 0 { break; } identity.write(&buffer[..count]); }
        }
    }
    let remotes: Vec<String> = text(git, repo, &["remote"])?.lines().map(str::to_owned).collect();
    let config = run(git, repo, &["config", "--local", "--list", "-z"])?;
    config.hash(&mut identity);
    Ok(ToolsState { review_token: format!("{:016x}", identity.finish()), head, branch: status.branch, operation, changed: status.changed, conflicts: status.conflicts, refs, stashes: entries(&stashes_text), reflog, remotes })
}
fn valid_name(git: &Path, repo: &Path, name: &str) -> Result<(), String> {
    if name.is_empty() || name.starts_with('-') || name == "HEAD" || name.len() > 255 { return Err("Enter a valid branch name.".into()); }
    run(git, repo, &["check-ref-format", &format!("refs/heads/{name}")]).map(|_| ()).map_err(|_| "Enter a valid branch name.".into())
}
fn commit(git: &Path, repo: &Path, target: &str) -> Result<String, String> {
    if target.is_empty() || target.starts_with('-') || target.len() > 512 { return Err("Select a revision.".into()); }
    text(git, repo, &["rev-parse", "--verify", "--end-of-options", &format!("{target}^{{commit}}")])
}
fn backup(git: &Path, repo: &Path, head: &str, reason: &str) -> Result<String, String> {
    let reference = format!("refs/gitorbit/recovery/{}-{}-{}", git::now_ms(), reason, &head[..8]);
    run(git, repo, &["update-ref", &reference, head])?; Ok(reference)
}
fn backup_changes(git: &Path, repo: &Path) -> Result<(), String> {
    let snapshot = text(git, repo, &["stash", "create", "GitOrbit rollback backup"])?;
    if !snapshot.is_empty() { run(git, repo, &["stash", "store", "-m", "GitOrbit rollback backup", &snapshot])?; }
    Ok(())
}
pub fn execute(git: &Path, repo: &Path, r: &Request) -> Result<String, String> {
    let state = inspect(git, repo)?;
    if state.review_token != r.review_token { return Err("Repository changed. Refresh and review the operation again.".into()); }
    if r.action == "continue" || r.action == "abort" || r.action == "skip" {
        let op = state.operation.as_deref().ok_or("No Git operation is in progress.")?;
        if r.action == "skip" && op == "merge" { return Err("A merge cannot be skipped.".into()); }
        if r.action == "continue" && state.conflicts > 0 { return Err("Resolve and stage all conflicts before continuing.".into()); }
        let flag = format!("--{}", r.action);
        run(git, repo, &["-c", "core.editor=true", "-c", "sequence.editor=true", op, &flag])?;
        return Ok("Git operation completed.".into());
    }
    if state.operation.is_some() && !matches!(r.action.as_str(), "resolve-ours" | "resolve-theirs" | "resolve-mark" | "resolve-edit") {
        return Err("Finish or abort the current Git operation first.".into());
    }
    let reference = state.refs.iter().find(|b| b.name == r.target);
    let clean = || if state.changed > 0 { Err("Commit or stash local changes before this operation.".to_owned()) } else { Ok(()) };
    let attached = || if state.branch == "(detached)" || state.head.is_empty() { Err("Select a branch with an initial commit first.".to_owned()) } else { Ok(()) };
    match r.action.as_str() {
        "publish" => {
            let b = reference.filter(|b| b.kind == "local").ok_or("Select a local branch.")?;
            if !state.remotes.contains(&r.name) { return Err("Select a configured remote.".into()); }
            run(git, repo, &["push", "--set-upstream", "--", &r.name, &format!("{}:{}", b.name, b.name)])?;
        }
        "delete-remote" => {
            let b = reference.filter(|b| b.kind == "remote").ok_or("Select a remote branch.")?;
            let (remote, branch) = state.remotes.iter().filter_map(|remote| b.name.strip_prefix(&format!("refs/remotes/{remote}/")).map(|branch| (remote, branch))).max_by_key(|(remote, _)| remote.len()).ok_or("Select a configured remote.")?;
            backup(git, repo, &b.hash, "remote-deleted")?;
            let lease = format!("--force-with-lease=refs/heads/{branch}:{}", b.hash);
            run(git, repo, &["push", &lease, "--", remote, &format!(":refs/heads/{branch}")])?;
        }
        "create-tag" | "delete-tag" => {
            if r.action == "create-tag" {
                if r.name.is_empty() || r.name.starts_with('-') { return Err("Enter a valid tag name.".into()); }
                run(git, repo, &["check-ref-format", &format!("refs/tags/{}", r.name)])?;
                let hash = commit(git, repo, &r.target)?;
                run(git, repo, &["tag", &r.name, &hash])?;
            } else {
                let b = reference.filter(|b| b.kind == "tag").ok_or("Select a tag.")?;
                let hash = commit(git, repo, &b.name)?;
                backup(git, repo, &hash, "tag-deleted")?;
                run(git, repo, &["tag", "-d", &b.name[10..]])?;
            }
        }
        "restore-stash" => {
            clean()?;
            let b = reference.filter(|b| b.kind == "recovery" && b.name.contains("-stash-")).ok_or("Select a saved stash recovery reference.")?;
            run(git, repo, &["stash", "apply", "--index", &b.hash])?;
        }
        "resolve-edit" => {
            if r.paths.len() != 1 || r.name.len() > 2_000_000 { return Err("Choose one text conflict file.".into()); }
            if r.name.lines().any(|line| line.starts_with("<<<<<<< ") || line == "=======" || line.starts_with(">>>>>>> ")) { return Err("Remove conflict markers before saving the result.".into()); }
            let changed = version_control::changes(git, repo)?;
            let file = changed.files.iter().find(|f| f.path == r.paths[0] && ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].contains(&f.status.as_str())).ok_or("Choose one text conflict file.")?;
            let path = repo.join(&file.path);
            let root = std::fs::canonicalize(repo).map_err(|e| e.to_string())?;
            let parent = std::fs::canonicalize(path.parent().ok_or("Invalid file path.")?).map_err(|e| e.to_string())?;
            if !parent.starts_with(&root) || path.is_symlink() { return Err("Choose a file inside this repository.".into()); }
            std::fs::write(&path, &r.name).map_err(|e| e.to_string())?;
            run(git, repo, &["--literal-pathspecs", "add", "--", &file.path])?;
        }
        "create" | "restore-branch" => {
            valid_name(git, repo, &r.name)?;
            let source = if r.target.is_empty() { commit(git, repo, "HEAD")? } else { commit(git, repo, &r.target)? };
            if r.checkout { run(git, repo, &["checkout", "--no-overwrite-ignore", "--no-track", "-b", &r.name, &source])?; }
            else { run(git, repo, &["branch", "--no-track", &r.name, &source])?; }
        }
        "checkout" => {
            let b = reference.ok_or("Select a branch or tag from the list.")?;
            if b.kind == "remote" { valid_name(git, repo, &r.name)?; }
            let saved = if r.mode == "smart" && state.changed > 0 {
                run(git, repo, &["stash", "push", "--include-untracked", "-m", "GitOrbit smart checkout"])?;
                Some(text(git, repo, &["rev-parse", "refs/stash"])? )
            } else { None };
            let result = match b.kind.as_str() {
                "local" => run(git, repo, &["checkout", "--no-overwrite-ignore", &b.name[11..], "--"]),
                "remote" => run(git, repo, &["checkout", "--no-overwrite-ignore", "-b", &r.name, "--track", &b.name]),
                _ => { let hash = commit(git, repo, &b.name)?; run(git, repo, &["checkout", "--no-overwrite-ignore", "--detach", &hash]) },
            };
            if let Err(error) = result {
                if saved.is_some() { return Err(format!("{error}\nLocal changes are saved in the smart checkout stash.")); }
                return Err(error);
            }
            if let Some(hash) = saved {
                backup(git, repo, &hash, "stash")?;
                run(git, repo, &["stash", "apply", "--index", &hash]).map_err(|error| format!("{error}\nLocal changes are saved in the smart checkout stash."))?;
                // Remove only our own stash, even if an external process added another.
                let list = entries(&text(git, repo, &["stash", "list", "--format=%gd%x09%H%x09%gs"])?);
                if let Some(entry) = list.iter().find(|s| s.hash == hash) { run(git, repo, &["stash", "drop", &entry.id])?; }
            }
        }
        "rename" | "delete" => {
            let b = reference.filter(|b| b.kind == "local").ok_or("Select a local branch.")?;
            if r.action == "rename" { valid_name(git, repo, &r.name)?; run(git, repo, &["branch", "-m", &b.name[11..], &r.name])?; }
            else {
                if b.current { return Err("Switch to another branch before deleting this branch.".into()); }
                backup(git, repo, &b.hash, "deleted")?;
                run(git, repo, &["branch", if r.force { "-D" } else { "-d" }, &b.name[11..]])?;
            }
        }
        "merge" | "rebase" | "cherry-pick" | "revert" => {
            clean()?; attached()?;
            let hash = commit(git, repo, &r.target)?;
            backup(git, repo, &state.head, &r.action)?;
            let mut args = vec!["-c", "core.editor=true", "-c", "sequence.editor=true", &r.action];
            if r.action == "merge" { args.push("--no-edit"); }
            args.push(&hash);
            run(git, repo, &args)?;
        }
        "reset" | "undo-commit" => {
            attached()?;
            let target = if r.action == "undo-commit" { "HEAD^" } else { &r.target };
            let hash = commit(git, repo, target)?;
            let mode = if r.action == "undo-commit" { "mixed" } else { &r.mode };
            if !["soft", "mixed", "hard"].contains(&mode) { return Err("Choose a reset mode.".into()); }
            if mode == "hard" { clean()?; }
            if state.changed > 0 { backup_changes(git, repo)?; }
            backup(git, repo, &state.head, "reset")?;
            run(git, repo, &["reset", &format!("--{mode}"), &hash])?;
        }
        "upstream" | "unset-upstream" => {
            attached()?;
            if r.action == "upstream" {
                let b = reference.filter(|b| b.kind == "remote").ok_or("Select a remote branch.")?;
                run(git, repo, &["branch", "--set-upstream-to", &b.name])?;
            } else { run(git, repo, &["branch", "--unset-upstream"])?; }
        }
        "stash" => {
            if state.conflicts > 0 { return Err("Resolve conflicts before stashing.".into()); }
            if state.changed == 0 { return Err("There are no local changes to stash.".into()); }
            let message = if r.name.is_empty() { "GitOrbit stash" } else { &r.name };
            run(git, repo, &["stash", "push", "--include-untracked", "-m", message])?;
        }
        "stash-apply" | "stash-pop" | "stash-drop" => {
            let s = state.stashes.iter().find(|s| s.hash == r.target).ok_or("This stash no longer exists.")?;
            if r.action != "stash-drop" { clean()?; }
            if r.action != "stash-apply" { backup(git, repo, &s.hash, "stash")?; }
            let command = r.action.strip_prefix("stash-").unwrap();
            if command == "drop" { run(git, repo, &["stash", command, &s.id])?; }
            else { run(git, repo, &["stash", command, "--index", &s.id])?; }
        }
        "rollback" | "resolve-ours" | "resolve-theirs" | "resolve-mark" => {
            if r.paths.is_empty() || r.paths.len() > 10000 { return Err("Select changed files first.".into()); }
            let changed = version_control::changes(git, repo)?;
            let mut paths = Vec::new();
            for path in &r.paths {
                let file = changed.files.iter().find(|f| &f.path == path).ok_or("A selected file is no longer changed.")?;
                if r.action == "rollback" && file.status == "??" { return Err("Stash unversioned files to preserve them before removing them.".into()); }
                paths.push(file.path.clone());
                if let Some(original) = &file.original_path { paths.push(original.clone()); }
            }
            paths.sort(); paths.dedup();
            if r.action == "rollback" {
                if state.head.is_empty() { return Err("Create an initial commit before rolling back files.".into()); }
                if paths.iter().any(|p| changed.files.iter().any(|f| &f.path == p && f.status == "??")) {
                    return Err("Stash unversioned files before restoring an overlapping tracked path.".into());
                }
                backup_changes(git, repo)?;
                let mut args = vec!["--literal-pathspecs", "reset", "-q", "HEAD", "--"];
                args.extend(paths.iter().map(String::as_str)); run(git, repo, &args)?;
                // Newly added files become unversioned; never delete user files silently.
                let tracked: Vec<_> = paths.iter().filter(|p| run(git, repo, &["--literal-pathspecs", "ls-files", "--error-unmatch", "--", p]).is_ok()).collect();
                if !tracked.is_empty() {
                    let mut args = vec!["--literal-pathspecs", "restore", "--source=HEAD", "--worktree", "--"];
                    args.extend(tracked.iter().map(|p| p.as_str())); run(git, repo, &args)?;
                }
            } else {
                if r.action != "resolve-mark" {
                    let side = if r.action == "resolve-ours" { "--ours" } else { "--theirs" };
                    let mut args = vec!["--literal-pathspecs", "checkout", side, "--"];
                    args.extend(paths.iter().map(String::as_str)); run(git, repo, &args)?;
                }
                let mut args = vec!["--literal-pathspecs", "add", "--"];
                args.extend(paths.iter().map(String::as_str)); run(git, repo, &args)?;
            }
        }
        _ => return Err("Unsupported Git operation.".into()),
    }
    Ok("Git operation completed.".into())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison { pub target: String, pub ahead: usize, pub behind: usize, pub diff: String, pub truncated: bool }
pub fn compare(git: &Path, repo: &Path, target: &str) -> Result<Comparison, String> {
    let target = commit(git, repo, target)?;
    let counts = text(git, repo, &["rev-list", "--left-right", "--count", &format!("HEAD...{target}")])?;
    let p: Vec<_> = counts.split_whitespace().collect();
    let bytes = run(git, repo, &["diff", "--no-ext-diff", "--no-textconv", "--no-color", &format!("HEAD..{target}"), "--"])?;
    let truncated = bytes.len() > 1_000_000;
    Ok(Comparison { target, ahead: p.first().and_then(|s| s.parse().ok()).unwrap_or(0), behind: p.get(1).and_then(|s| s.parse().ok()).unwrap_or(0), diff: String::from_utf8_lossy(&bytes[..bytes.len().min(1_000_000)]).into_owned(), truncated })
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict { pub base: String, pub ours: String, pub theirs: String, pub working: String, pub review_token: String }
pub fn conflict(git: &Path, repo: &Path, path: &str) -> Result<Conflict, String> {
    let changed = version_control::changes(git, repo)?;
    let file = changed.files.iter().find(|f| f.path == path && ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].contains(&f.status.as_str())).ok_or("Choose one text conflict file.")?;
    let content = |stage: usize| -> Result<String, String> {
        let bytes = run(git, repo, &["show", &format!(":{stage}:{}", file.path)]).unwrap_or_default();
        if bytes.len() > 2_000_000 || bytes.contains(&0) { return Err("This conflict needs an external editor (binary or large file).".into()); }
        String::from_utf8(bytes).map_err(|_| "This conflict needs an external editor (binary or large file).".into())
    };
    let working_path = repo.join(&file.path);
    if working_path.is_symlink() { return Err("This conflict needs an external editor (binary or large file).".into()); }
    let working = std::fs::read(&working_path).unwrap_or_default();
    if working.len() > 2_000_000 || working.contains(&0) { return Err("This conflict needs an external editor (binary or large file).".into()); }
    Ok(Conflict { base: content(1)?, ours: content(2)?, theirs: content(3)?, working: String::from_utf8(working).map_err(|_| "This conflict needs an external editor (binary or large file).".to_owned())?, review_token: inspect(git, repo)?.review_token })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let root = tempfile::tempdir().unwrap(); let (git, _) = git::find_git().unwrap();
        run(&git, root.path(), &["init", "-q", "-b", "main"]).unwrap();
        for args in [["config", "user.name", "Test"], ["config", "user.email", "test@example.com"], ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"]] { run(&git, root.path(), &args).unwrap(); }
        save(&git, root.path(), "file.txt", "base\n"); (root, git)
    }
    fn save(git: &Path, repo: &Path, file: &str, content: &str) {
        fs::write(repo.join(file), content).unwrap();
        run(git, repo, &["add", "--", file]).unwrap(); run(git, repo, &["commit", "-qm", file]).unwrap();
    }
    fn request(git: &Path, repo: &Path, action: &str, target: &str, name: &str) -> Request {
        Request { action: action.into(), target: target.into(), name: name.into(), paths: vec![], mode: "mixed".into(), force: false, checkout: true, review_token: inspect(git, repo).unwrap().review_token }
    }
    fn act(git: &Path, repo: &Path, action: &str, target: &str, name: &str) { execute(git, repo, &request(git, repo, action, target, name)).unwrap(); }
    #[test]
    fn branches_can_be_created_renamed_deleted_and_recovered() {
        let (root, git) = fixture(); let repo = root.path();
        let initial = inspect(&git, repo).unwrap(); assert_eq!(initial.refs.len(), 1); assert!(initial.refs[0].current);
        let mut create = request(&git, repo, "create", "HEAD", "feature/a"); create.checkout = false;
        execute(&git, repo, &create).unwrap(); assert_eq!(inspect(&git, repo).unwrap().branch, "main");
        act(&git, repo, "rename", "refs/heads/feature/a", "feature/b");
        act(&git, repo, "checkout", "refs/heads/feature/b", "");
        assert!(execute(&git, repo, &request(&git, repo, "delete", "refs/heads/feature/b", "")).is_err());
        save(&git, repo, "feature.txt", "feature\n"); let feature_head = inspect(&git, repo).unwrap().head;
        act(&git, repo, "checkout", "refs/heads/main", "");
        assert!(execute(&git, repo, &request(&git, repo, "delete", "refs/heads/feature/b", "")).is_err());
        let mut delete = request(&git, repo, "delete", "refs/heads/feature/b", ""); delete.force = true; execute(&git, repo, &delete).unwrap();
        let state = inspect(&git, repo).unwrap(); assert!(!state.refs.iter().any(|b| b.name == "refs/heads/feature/b"));
        let recovery = state.refs.iter().find(|b| b.kind == "recovery" && b.hash == feature_head).unwrap();
        act(&git, repo, "restore-branch", &recovery.name, "restored");
        assert_eq!(inspect(&git, repo).unwrap().head, feature_head);
    }
    #[test]
    fn stale_reviews_reject_content_and_branch_changes() {
        let (root, git) = fixture(); let repo = root.path();
        fs::write(repo.join("file.txt"), "first edit").unwrap();
        let old = request(&git, repo, "rollback", "", "");
        fs::write(repo.join("file.txt"), "second edit").unwrap();
        assert!(execute(&git, repo, &old).unwrap_err().contains("Repository changed"));
        fs::write(repo.join("new.txt"), "first").unwrap();
        let old = request(&git, repo, "stash", "", "");
        fs::write(repo.join("new.txt"), "second").unwrap();
        assert!(execute(&git, repo, &old).is_err());
        let old = request(&git, repo, "create", "HEAD", "feature");
        run(&git, repo, &["branch", "other"]).unwrap();
        assert!(execute(&git, repo, &old).is_err());
    }
    #[test]
    fn smart_checkout_restores_local_work_and_keeps_a_recovery_stash() {
        let (root, git) = fixture(); let repo = root.path();
        let mut create = request(&git, repo, "create", "HEAD", "feature"); create.checkout = false; execute(&git, repo, &create).unwrap();
        fs::write(repo.join("file.txt"), "local work\n").unwrap(); fs::write(repo.join("new.txt"), "new\n").unwrap();
        let mut checkout = request(&git, repo, "checkout", "refs/heads/feature", ""); checkout.mode = "smart".into(); execute(&git, repo, &checkout).unwrap();
        assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "local work\n"); assert!(repo.join("new.txt").exists());
        let state = inspect(&git, repo).unwrap(); assert_eq!(state.branch, "feature"); assert!(state.stashes.is_empty()); assert!(state.refs.iter().any(|r| r.name.contains("-stash-")));
    }
    #[test]
    fn checkout_does_not_overwrite_ignored_local_files() {
        let (root, git) = fixture(); let repo = root.path();
        save(&git, repo, ".gitignore", "protected.txt\n");
        act(&git, repo, "create", "HEAD", "feature");
        fs::write(repo.join("protected.txt"), "tracked on feature\n").unwrap();
        run(&git, repo, &["add", "-f", "protected.txt"]).unwrap(); run(&git, repo, &["commit", "-qm", "feature file"]).unwrap();
        act(&git, repo, "checkout", "refs/heads/main", "");
        fs::write(repo.join("protected.txt"), "ignored local work\n").unwrap();
        assert!(execute(&git, repo, &request(&git, repo, "checkout", "refs/heads/feature", "")).is_err());
        assert_eq!(fs::read_to_string(repo.join("protected.txt")).unwrap(), "ignored local work\n");
        assert_eq!(inspect(&git, repo).unwrap().branch, "main");
    }
    #[test]
    fn rollback_refuses_to_overwrite_an_unversioned_rename_source() {
        let (root, git) = fixture(); let repo = root.path();
        run(&git, repo, &["mv", "file.txt", "renamed.txt"]).unwrap();
        fs::write(repo.join("file.txt"), "unversioned work\n").unwrap();
        let mut rollback = request(&git, repo, "rollback", "", ""); rollback.paths = vec!["renamed.txt".into()];
        assert!(execute(&git, repo, &rollback).is_err());
        assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "unversioned work\n");
    }
    #[test]
    fn rollback_preserves_backup_index_and_new_file_contents() {
        let (root, git) = fixture(); let repo = root.path();
        fs::write(repo.join("file.txt"), "staged\n").unwrap(); run(&git, repo, &["add", "file.txt"]).unwrap();
        fs::write(repo.join("file.txt"), "unstaged\n").unwrap();
        fs::write(repo.join("new.txt"), "new file\n").unwrap(); run(&git, repo, &["add", "new.txt"]).unwrap();
        let mut rollback = request(&git, repo, "rollback", "", ""); rollback.paths = vec!["file.txt".into(), "new.txt".into()];
        execute(&git, repo, &rollback).unwrap();
        assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "base\n");
        assert_eq!(fs::read_to_string(repo.join("new.txt")).unwrap(), "new file\n");
        assert_eq!(version_control::changes(&git, repo).unwrap().staged, 0);
        assert_eq!(text(&git, repo, &["show", "stash@{0}:file.txt"]).unwrap(), "unstaged");
        assert_eq!(text(&git, repo, &["show", "stash@{0}^2:file.txt"]).unwrap(), "staged");
    }
    #[test]
    fn stashes_keep_unversioned_files_and_recover_after_drop() {
        let (root, git) = fixture(); let repo = root.path();
        fs::write(repo.join("file.txt"), "edit\n").unwrap(); run(&git, repo, &["add", "file.txt"]).unwrap();
        fs::write(repo.join("untracked.txt"), "private\n").unwrap();
        act(&git, repo, "stash", "", "saved work");
        let state = inspect(&git, repo).unwrap(); let hash = state.stashes[0].hash.clone(); assert_eq!(state.changed, 0);
        act(&git, repo, "stash-drop", &hash, "");
        let state = inspect(&git, repo).unwrap(); assert!(state.stashes.is_empty());
        let reference = state.refs.iter().find(|b| b.name.contains("-stash-")).unwrap();
        act(&git, repo, "restore-stash", &reference.name, "");
        assert_eq!(fs::read_to_string(repo.join("untracked.txt")).unwrap(), "private\n");
        assert_eq!(version_control::changes(&git, repo).unwrap().staged, 1);
        act(&git, repo, "stash", "", "again");
        let hash = inspect(&git, repo).unwrap().stashes[0].hash.clone(); act(&git, repo, "stash-pop", &hash, "");
        assert!(inspect(&git, repo).unwrap().stashes.is_empty());
    }
    #[test]
    fn merge_conflicts_can_be_edited_continued_or_aborted() {
        let (root, git) = fixture(); let repo = root.path();
        act(&git, repo, "create", "HEAD", "feature"); save(&git, repo, "file.txt", "theirs\n");
        act(&git, repo, "checkout", "refs/heads/main", ""); save(&git, repo, "file.txt", "ours\n");
        let before = inspect(&git, repo).unwrap().head;
        assert!(execute(&git, repo, &request(&git, repo, "merge", "refs/heads/feature", "")).is_err());
        assert_eq!(inspect(&git, repo).unwrap().operation.as_deref(), Some("merge"));
        let data = conflict(&git, repo, "file.txt").unwrap(); assert_eq!(data.base, "base\n"); assert_eq!(data.ours, "ours\n"); assert_eq!(data.theirs, "theirs\n");
        assert!(execute(&git, repo, &request(&git, repo, "continue", "", "")).is_err());
        act(&git, repo, "abort", "", ""); assert_eq!(inspect(&git, repo).unwrap().head, before);
        assert!(execute(&git, repo, &request(&git, repo, "merge", "refs/heads/feature", "")).is_err());
        let mut edit = request(&git, repo, "resolve-edit", "", "combined\n"); edit.paths = vec!["file.txt".into()];
        execute(&git, repo, &edit).unwrap(); act(&git, repo, "continue", "", "");
        assert!(inspect(&git, repo).unwrap().operation.is_none()); assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "combined\n");
        assert_eq!(compare(&git, repo, "refs/heads/feature").unwrap().behind, 0);
    }
    #[test]
    fn cherry_pick_revert_reset_and_undo_preserve_recoverable_history() {
        let (root, git) = fixture(); let repo = root.path(); let base = inspect(&git, repo).unwrap().head;
        act(&git, repo, "create", "HEAD", "feature"); save(&git, repo, "feature.txt", "feature\n"); let feature = inspect(&git, repo).unwrap().head;
        act(&git, repo, "checkout", "refs/heads/main", ""); act(&git, repo, "cherry-pick", &feature, "");
        let picked = inspect(&git, repo).unwrap().head; assert!(repo.join("feature.txt").exists());
        act(&git, repo, "revert", &picked, ""); assert!(!repo.join("feature.txt").exists());
        let mut reset = request(&git, repo, "reset", &base, ""); reset.mode = "hard".into(); execute(&git, repo, &reset).unwrap();
        save(&git, repo, "undo.txt", "keep\n"); let old = inspect(&git, repo).unwrap().head;
        act(&git, repo, "undo-commit", "", ""); assert_eq!(inspect(&git, repo).unwrap().head, base);
        assert_eq!(fs::read_to_string(repo.join("undo.txt")).unwrap(), "keep\n");
        assert!(inspect(&git, repo).unwrap().refs.iter().any(|b| b.kind == "recovery" && b.hash == old));
        let mut hard = request(&git, repo, "reset", &base, ""); hard.mode = "hard".into(); assert!(execute(&git, repo, &hard).is_err());
    }
    #[test]
    fn rebase_remote_checkout_publication_tags_and_lease_protected_delete() {
        let (root, git) = fixture(); let repo = root.path();
        act(&git, repo, "create", "HEAD", "feature"); save(&git, repo, "feature.txt", "feature\n");
        act(&git, repo, "checkout", "refs/heads/main", ""); save(&git, repo, "main.txt", "main\n");
        act(&git, repo, "checkout", "refs/heads/feature", ""); act(&git, repo, "rebase", "refs/heads/main", "");
        assert!(repo.join("main.txt").exists()); assert!(repo.join("feature.txt").exists());
        act(&git, repo, "create-tag", "HEAD", "v-test"); assert!(inspect(&git, repo).unwrap().refs.iter().any(|b| b.kind == "tag"));
        act(&git, repo, "delete-tag", "refs/tags/v-test", "");
        let remote = tempfile::tempdir().unwrap(); run(&git, remote.path(), &["init", "--bare", "-q"]).unwrap();
        run(&git, repo, &["remote", "add", "origin", remote.path().to_str().unwrap()]).unwrap();
        act(&git, repo, "publish", "refs/heads/feature", "origin");
        act(&git, repo, "checkout", "refs/remotes/origin/feature", "tracked");
        assert_eq!(inspect(&git, repo).unwrap().branch, "tracked");
        act(&git, repo, "unset-upstream", "", ""); act(&git, repo, "upstream", "refs/remotes/origin/feature", "");
        let old = inspect(&git, repo).unwrap().head;
        let base = text(&git, repo, &["rev-parse", "HEAD^"]).unwrap();
        run(&git, remote.path(), &["update-ref", "refs/heads/feature", &base]).unwrap();
        assert!(execute(&git, repo, &request(&git, repo, "delete-remote", "refs/remotes/origin/feature", "")).is_err());
        run(&git, remote.path(), &["update-ref", "refs/heads/feature", &old]).unwrap();
        act(&git, repo, "delete-remote", "refs/remotes/origin/feature", "");
        assert!(text(&git, remote.path(), &["rev-parse", "--verify", "refs/heads/feature"]).is_err());
    }
}
