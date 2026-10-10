use crate::{git, git_tools, version_control::{self, run, CommitDiff}};
use serde::Serialize;
use std::{collections::HashSet, path::{Component, Path, PathBuf}, sync::atomic::{AtomicU64, Ordering}, time::Duration};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashFile { pub path: String, pub original_path: Option<String>, pub status: String, pub area: String }
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashPreview {
    pub review_token: String, pub hash: String, pub subject: String,
    pub base_revision: String, pub index_revision: String, pub untracked_revision: Option<String>, pub files: Vec<StashFile>,
}
fn text(git: &Path, repo: &Path, args: &[&str]) -> Result<String, String> {
    Ok(String::from_utf8_lossy(&run(git, repo, args)?).trim().to_owned())
}
fn valid_path(path: &str) -> Result<(), String> {
    if path.is_empty() || path.len() > 4096 || path.contains(['\0', '\\', ':']) || path.starts_with('/')
        || !Path::new(path).components().all(|c| matches!(c, Component::Normal(_)))
        || path.split('/').any(|c| c.is_empty() || c == "." || c == ".." || c.eq_ignore_ascii_case(".git")) {
        return Err("Choose a repository-relative file path.".into());
    }
    Ok(())
}
struct TemporaryIndex { directory: PathBuf, index: PathBuf }
impl TemporaryIndex {
    fn new() -> Result<Self, String> {
        // create_dir must succeed exclusively; never reuse a caller-controlled index.
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let directory = std::env::temp_dir().join(format!("gitorbit-selected-stash-{}-{}-{}", std::process::id(), git::now_ms(), NEXT.fetch_add(1, Ordering::Relaxed)));
        std::fs::create_dir(&directory).map_err(|e| format!("Could not prepare a temporary stash index: {e}"))?;
        Ok(Self { index: directory.join("index"), directory })
    }
    fn run(&self, git: &Path, repo: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
        let mut command = git::git_command(git, repo); command.env("GIT_INDEX_FILE", &self.index).args(args);
        git::capture(command, Duration::from_secs(45))
    }
}
impl Drop for TemporaryIndex {
    fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.directory); }
}
fn parse_files(bytes: &[u8], area: &str) -> Result<Vec<StashFile>, String> {
    let fields: Vec<_> = bytes.split(|b| *b == 0).collect(); let mut i = 0; let mut files = vec![];
    while i < fields.len() && !fields[i].is_empty() {
        let status = String::from_utf8_lossy(fields[i]).into_owned(); i += 1;
        let first = fields.get(i).ok_or("Git returned an incomplete stash file.")?; i += 1;
        let old = String::from_utf8_lossy(first).into_owned();
        let (path, original_path) = if status.starts_with(['R','C']) {
            let next = fields.get(i).ok_or("Git returned an incomplete stash rename.")?; i += 1;
            (String::from_utf8_lossy(next).into_owned(), Some(old))
        } else { (old, None) };
        files.push(StashFile {path, original_path, status, area: area.into()});
    }
    Ok(files)
}
pub fn preview(git: &Path, repo: &Path, stash_hash: &str) -> Result<StashPreview, String> {
    let state = git_tools::inspect(git, repo)?;
    let entry = state.stashes.iter().find(|s| s.hash == stash_hash).ok_or("This stash no longer exists. Refresh the stash list.")?;
    preview_snapshot(git, repo, &entry.hash, &entry.subject, state.review_token)
}
pub(crate) fn preview_snapshot(git: &Path, repo: &Path, hash: &str, subject: &str, review_token: String) -> Result<StashPreview, String> {
    let parents = text(git, repo, &["rev-list", "--parents", "-n", "1", hash])?;
    let parts: Vec<_> = parents.split_whitespace().collect();
    if parts.len() < 3 || parts.len() > 4 { return Err("This stash has an unsupported layout.".into()); }
    let base = parts[1]; let index = parts[2]; let untracked = parts.get(3).map(|p| p.to_string());
    let mut files = vec![];
    for (revision, area) in [(hash, "working"), (index, "index")] {
        files.extend(parse_files(&run(git, repo, &["diff-tree", "--no-commit-id", "--name-status", "--find-renames", "-r", "-z", base, revision])?, area)?);
    }
    if let Some(revision) = &untracked {
        files.extend(parse_files(&run(git, repo, &["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-z", revision])?, "untracked")?);
    }
    Ok(StashPreview {review_token, hash: hash.into(), subject: subject.into(), base_revision: base.into(), index_revision: index.into(), untracked_revision: untracked, files})
}
pub fn diff(git: &Path, repo: &Path, stash_hash: &str, file: &str, area: &str) -> Result<CommitDiff, String> {
    valid_path(file)?;
    let state = preview(git, repo, stash_hash)?;
    diff_snapshot(git, repo, state, file, area)
}
pub(crate) fn diff_snapshot(git: &Path, repo: &Path, state: StashPreview, file: &str, area: &str) -> Result<CommitDiff, String> {
    valid_path(file)?;
    let selected = state.files.iter().find(|f| f.path == file && f.area == area).ok_or("Choose a file from the stash preview.")?;
    let after = match area { "working" => &state.hash, "index" => &state.index_revision, "untracked" => state.untracked_revision.as_ref().ok_or("This stash has no unversioned files.")?, _ => return Err("Choose a stash file group.".into()) };
    let mut args = vec!["--literal-pathspecs"];
    if area == "untracked" { args.extend(["diff-tree", "--root", "--no-commit-id", "-r", "-p", "--no-ext-diff", "--no-textconv", "--no-color", after]); }
    else { args.extend(["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--find-renames", &state.base_revision, after]); }
    args.extend(["--", file]); if let Some(old) = &selected.original_path { args.push(old); }
    let mut bytes = run(git, repo, &args)?; let truncated = bytes.len() > 512*1024; bytes.truncate(512*1024);
    Ok(CommitDiff { text: String::from_utf8_lossy(&bytes).into_owned(), truncated, before_revision: if area == "untracked" { None } else { Some(state.base_revision) }, after_revision: after.clone() })
}
pub fn save_selected(git: &Path, repo: &Path, paths: &[String], message: &str, review_token: &str) -> Result<String, String> {
    save_selection(git, repo, paths, message, review_token, false)?;
    Ok("Selected files saved in a stash.".into())
}
pub(crate) fn shelve_selected(git: &Path, repo: &Path, paths: &[String], message: &str, review_token: &str) -> Result<String, String> {
    save_selection(git, repo, paths, message, review_token, true)
}
pub(crate) fn restore_snapshot(git: &Path, repo: &Path, snapshot: &StashPreview, review_token: &str) -> Result<(), String> {
    let mut affected=HashSet::new();let mut untracked=vec![];
    for file in &snapshot.files {
        for path in std::iter::once(&file.path).chain(file.original_path.as_ref()) {
            valid_path(path)?;
            // Refuse ancestor symlinks, including links to paths outside the repository.
            let mut ancestor=repo.to_path_buf();let parts:Vec<_>=path.split('/').collect();
            for component in &parts[..parts.len()-1] {ancestor.push(component);match std::fs::symlink_metadata(&ancestor){Ok(meta) if meta.file_type().is_symlink()=>return Err("A shelf path crosses a symbolic link. Restore it using Git after reviewing the path.".into()),Ok(_)=>{},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>break,Err(e)=>return Err(e.to_string())}}
            if file.area!="untracked" {affected.insert(path.clone());}
        }
        if file.area=="untracked" {
            match std::fs::symlink_metadata(repo.join(&file.path)) {Ok(_)=>return Err("A saved new file already exists locally. Move it before unshelving.".into()),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(e)=>return Err(e.to_string())}
            untracked.push(file.path.clone());
        }
    }
    let temporary=TemporaryIndex::new()?;
    temporary.run(git,repo,&["read-tree","HEAD"])?;
    let index_patch=run(git,repo,&["diff","--binary","--full-index","--no-ext-diff","--no-textconv",&snapshot.base_revision,&snapshot.index_revision])?;
    let index_file=temporary.directory.join("shelf-index.patch");
    if !index_patch.is_empty() {
        std::fs::write(&index_file,index_patch).map_err(|e|e.to_string())?;
        temporary.run(git,repo,&["apply","--cached","--3way","--whitespace=nowarn",index_file.to_str().ok_or("Invalid temporary shelf path.")?])?;
    }
    let working_patch=run(git,repo,&["diff","--binary","--full-index","--no-ext-diff","--no-textconv",&snapshot.base_revision,&snapshot.hash])?;
    if git_tools::inspect(git,repo)?.review_token != review_token {
        return Err("Repository changed. Refresh and review the operation again.".into());
    }
    if !working_patch.is_empty() {
        let working_file=temporary.directory.join("shelf-working.patch");std::fs::write(&working_file,working_patch).map_err(|e|e.to_string())?;
        // Path-scoped Git apply leaves unrelated staged and unstaged files untouched.
        run(git,repo,&["apply","--3way","--index","--whitespace=nowarn",working_file.to_str().ok_or("Invalid temporary shelf path.")?])?;
    }
    if !affected.is_empty() {
        let mut affected:Vec<_>=affected.into_iter().collect();affected.sort();
        let mut list_args=vec!["--literal-pathspecs","ls-files","--stage","-z","--"];list_args.extend(affected.iter().map(String::as_str));
        let saved_index=temporary.run(git,repo,&list_args)?;
        let mut remove_args=vec!["--literal-pathspecs","update-index","--force-remove","--"];remove_args.extend(affected.iter().map(String::as_str));run(git,repo,&remove_args)?;
        for record in saved_index.split(|b|*b==0).filter(|r|!r.is_empty()) {
            let record=std::str::from_utf8(record).map_err(|_|"Saved filenames must be valid UTF-8.")?;
            let (metadata,path)=record.split_once('\t').ok_or("Invalid saved index entry.")?;let parts:Vec<_>=metadata.split(' ').collect();
            if parts.len()!=3||parts[2]!="0" {return Err("Resolve the shelf index conflicts before restoring staging.".into());}
            run(git,repo,&["update-index","--add","--cacheinfo",&format!("{},{},{}",parts[0],parts[1],path)])?;
        }
    }
    if let Some(revision)=&snapshot.untracked_revision {
        if !untracked.is_empty(){let mut args=vec!["--literal-pathspecs","restore","--source",revision,"--worktree","--"];args.extend(untracked.iter().map(String::as_str));run(git,repo,&args)?;}
    }
    Ok(())
}
fn save_selection(git: &Path, repo: &Path, paths: &[String], message: &str, review_token: &str, shelf: bool) -> Result<String, String> {
    let state = git_tools::inspect(git, repo)?;
    if state.review_token != review_token { return Err("Repository changed. Refresh and review the operation again.".into()); }
    if state.operation.is_some() { return Err("Finish or abort the current Git operation first.".into()); }
    if state.conflicts > 0 { return Err("Resolve conflicts before stashing.".into()); }
    if state.head.is_empty() { return Err("Create an initial commit before stashing.".into()); }
    if paths.is_empty() || paths.len() > 1000 { return Err("Select between 1 and 1,000 changed files to stash.".into()); }
    if message.len() > 4096 || message.contains('\0') { return Err("Enter a shorter stash message.".into()); }
    let changed = version_control::changes(git, repo)?; let mut chosen = vec![]; let mut untracked = vec![]; let mut seen = HashSet::new();
    for path in paths {
        valid_path(path)?;
        let file = changed.files.iter().find(|f| &f.path == path).ok_or("The selected files changed. Refresh and review the stash again.")?;
        if seen.insert(path.clone()) { chosen.push(path.clone()); if file.status == "??" { untracked.push(path.clone()); } }
        if let Some(old) = &file.original_path { valid_path(old)?; if seen.insert(old.clone()) { chosen.push(old.clone()); } }
    }
    // Native pathspec stashing still stores EVERY staged file in its snapshots.
    // Prepare a separate index containing only HEAD and the chosen staged changes.
    let temporary = TemporaryIndex::new()?;
    temporary.run(git, repo, &["read-tree", &state.head])?;
    let mut patch_args = vec!["--literal-pathspecs", "diff", "--cached", "--binary", "--full-index", "--no-ext-diff", "--no-textconv", &state.head, "--"];
    patch_args.extend(chosen.iter().map(String::as_str));
    let patch = run(git, repo, &patch_args)?;
    if !patch.is_empty() {
        let patch_file = temporary.directory.join("selected.patch"); std::fs::write(&patch_file, patch).map_err(|e| e.to_string())?;
        temporary.run(git, repo, &["apply", "--cached", "--binary", "--whitespace=nowarn", patch_file.to_str().ok_or("The temporary stash path is not valid UTF-8.")?])?;
    }
    let title = if message.trim().is_empty() { "GitOrbit selected files" } else { message.trim() };
    let index_tree = String::from_utf8_lossy(&temporary.run(git, repo, &["write-tree"])?).trim().to_owned();
    let index_commit = text(git, repo, &["-c", "commit.gpgsign=false", "commit-tree", &index_tree, "-p", &state.head, "-m", &format!("index: {title}")])?;
    // Construct the standard stash commit layout directly. `stash push -- paths`
    // rejects the absent original name of staged renames and staged deletions.
    let mut working_args = vec!["--literal-pathspecs", "diff", "--binary", "--full-index", "--no-ext-diff", "--no-textconv", "--"];
    working_args.extend(chosen.iter().map(String::as_str));
    let working_patch = run(git, repo, &working_args)?;
    if !working_patch.is_empty() {
        let patch_file = temporary.directory.join("working.patch"); std::fs::write(&patch_file, working_patch).map_err(|e| e.to_string())?;
        temporary.run(git, repo, &["apply", "--cached", "--binary", "--whitespace=nowarn", patch_file.to_str().ok_or("The temporary stash path is not valid UTF-8.")?])?;
    }
    let working_tree = String::from_utf8_lossy(&temporary.run(git, repo, &["write-tree"])?).trim().to_owned();
    let untracked_commit = if untracked.is_empty() { None } else {
        temporary.run(git, repo, &["read-tree", "--empty"])?;
        let mut add_args = vec!["--literal-pathspecs", "add", "--"]; add_args.extend(untracked.iter().map(String::as_str));
        temporary.run(git, repo, &add_args)?;
        let tree = String::from_utf8_lossy(&temporary.run(git, repo, &["write-tree"])?).trim().to_owned();
        Some(text(git, repo, &["-c", "commit.gpgsign=false", "commit-tree", &tree, "-m", &format!("untracked: {title}")])?)
    };
    let mut commit_args = vec!["-c", "commit.gpgsign=false", "commit-tree", &working_tree, "-p", &state.head, "-p", &index_commit];
    if let Some(commit) = &untracked_commit { commit_args.extend(["-p", commit]); }
    commit_args.extend(["-m", title]); let saved = text(git, repo, &commit_args)?;
    let mut head_args = vec!["--literal-pathspecs", "ls-tree", "-r", "-z", "--name-only", &state.head, "--"];
    head_args.extend(chosen.iter().map(String::as_str));
    let head_bytes = run(git, repo, &head_args)?;
    let head_paths: Vec<String> = head_bytes.split(|b| *b == 0).filter(|p| !p.is_empty()).map(|p| String::from_utf8(p.to_vec()).map_err(|_| "Selected filenames must be valid UTF-8.".to_owned())).collect::<Result<_,_>>()?;
    if git_tools::inspect(git, repo)?.review_token != review_token { return Err("Repository changed. Refresh and review the operation again.".into()); }
    // Store before touching the real index or working tree. Any cleanup failure
    // leaves a durable standard stash; callers must refresh before retrying.
    let reference = if shelf {
        static NEXT_SHELF: AtomicU64 = AtomicU64::new(0);
        let reference = format!("refs/gitorbit/shelves/{}-{}-{}", git::now_ms(), std::process::id(), NEXT_SHELF.fetch_add(1, Ordering::Relaxed));
        run(git, repo, &["update-ref", &reference, &saved, &"0".repeat(saved.len())])?;
        reference
    } else { run(git, repo, &["stash", "store", "-m", title, &saved])?; String::new() };
    let cleanup_error = |error: String| if shelf {format!("{error}\nThe shelf was saved, but cleanup did not finish. Refresh before continuing.")} else {format!("{error}\nThe selected files are saved in the stash, but cleanup did not finish. Refresh before continuing.")};
    let mut reset_args = vec!["--literal-pathspecs", "reset", "-q", &state.head, "--"];
    reset_args.extend(chosen.iter().map(String::as_str));
    run(git, repo, &reset_args).map_err(cleanup_error)?;
    if !head_paths.is_empty() {
        let mut restore_args = vec!["--literal-pathspecs", "restore", "--source", &state.head, "--worktree", "--"];
        restore_args.extend(head_paths.iter().map(String::as_str)); run(git, repo, &restore_args).map_err(cleanup_error)?;
    }
    let added_paths: Vec<_> = chosen.iter().filter(|p| !head_paths.contains(p)).collect();
    if !added_paths.is_empty() {
        let mut clean_args = vec!["--literal-pathspecs", "clean", "-f", "-x", "--"];
        clean_args.extend(added_paths.iter().map(|p| p.as_str())); run(git, repo, &clean_args).map_err(cleanup_error)?;
    }
    Ok(reference)
}
pub fn branch(git: &Path, repo: &Path, stash_hash: &str, name: &str, review_token: &str) -> Result<String, String> {
    let state = git_tools::inspect(git, repo)?;
    if state.review_token != review_token { return Err("Repository changed. Refresh and review the operation again.".into()); }
    if state.operation.is_some() { return Err("Finish or abort the current Git operation first.".into()); }
    if state.changed > 0 { return Err("Commit or stash local changes before this operation.".into()); }
    if name.is_empty() || name.starts_with('-') || name == "HEAD" || name.len() > 255 { return Err("Enter a valid branch name.".into()); }
    run(git, repo, &["check-ref-format", &format!("refs/heads/{name}")])?;
    let stash = state.stashes.iter().find(|s| s.hash == stash_hash).ok_or("This stash no longer exists. Refresh the stash list.")?;
    let base = text(git, repo, &["rev-parse", "--verify", &format!("{}^1", stash.hash)])?;
    // Keep a durable recovery reference and the original stash even if applying conflicts.
    let recovery = format!("refs/gitorbit/recovery/{}-stash-{}", git::now_ms(), &stash.hash[..8]);
    run(git, repo, &["update-ref", &recovery, &stash.hash])?;
    run(git, repo, &["checkout", "--no-overwrite-ignore", "--no-track", "-b", name, &base])?;
    run(git, repo, &["stash", "apply", "--index", &stash.hash]).map_err(|error| format!("{error}\nThe new branch is checked out. The original stash is preserved; resolve the files before continuing."))?;
    Ok("Stash restored on a new branch. The original stash is preserved.".into())
}

#[cfg(test)]
mod tests {
    use super::*; use std::fs;
    fn fixture() -> (tempfile::TempDir, std::path::PathBuf) {
        let root = tempfile::tempdir().unwrap(); let (git, _) = git::find_git().expect("Git required");
        for args in [&["init", "-q", "-b", "main"][..], &["config", "user.name", "Demo Author"], &["config", "user.email", "demo@example.test"], &["config", "commit.gpgsign", "false"], &["config", "core.autocrlf", "false"]] { run(&git, root.path(), args).unwrap(); }
        for name in ["file.txt", "other.txt"] { fs::write(root.path().join(name), "base\n").unwrap(); }
        run(&git, root.path(), &["add", "."]).unwrap(); run(&git, root.path(), &["commit", "-qm", "Initial"]).unwrap();
        (root, git)
    }
    #[test]
    fn previews_staged_working_and_unversioned_content_and_branches_without_dropping() {
        let (root, git) = fixture(); let repo = root.path();
        fs::write(repo.join("file.txt"), "staged\n").unwrap(); run(&git, repo, &["add", "file.txt"]).unwrap();
        fs::write(repo.join("file.txt"), "working\n").unwrap(); fs::write(repo.join("new.txt"), "new\n").unwrap();
        run(&git, repo, &["stash", "push", "-u", "-m", "Save"]).unwrap(); let hash = text(&git, repo, &["rev-parse", "refs/stash"]).unwrap();
        let preview = preview(&git, repo, &hash).unwrap(); assert!(preview.files.iter().any(|f| f.area == "working" && f.path == "file.txt")); assert!(preview.files.iter().any(|f| f.area == "index")); assert!(preview.files.iter().any(|f| f.area == "untracked" && f.path == "new.txt"));
        assert!(diff(&git, repo, &hash, "file.txt", "working").unwrap().text.contains("+working")); assert!(diff(&git, repo, &hash, "file.txt", "index").unwrap().text.contains("+staged"));
        let added = diff(&git, repo, &hash, "new.txt", "untracked").unwrap(); assert!(added.before_revision.is_none()); assert!(added.text.contains("+new"));
        branch(&git, repo, &hash, "restored", &preview.review_token).unwrap();
        assert_eq!(text(&git, repo, &["branch", "--show-current"]).unwrap(), "restored"); assert_eq!(text(&git, repo, &["show", ":file.txt"]).unwrap(), "staged"); assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "working\n"); assert!(repo.join("new.txt").exists());
        assert_eq!(git_tools::inspect(&git, repo).unwrap().stashes[0].hash, hash);
    }
    #[test]
    fn selected_stash_keeps_other_staged_unstaged_and_unversioned_files() {
        let (root, git) = fixture(); let repo = root.path();
        fs::write(repo.join("file.txt"), "selected staged\n").unwrap(); run(&git, repo, &["add", "file.txt"]).unwrap(); fs::write(repo.join("file.txt"), "selected working\n").unwrap(); fs::write(repo.join("other.txt"), "staged other\n").unwrap(); run(&git, repo, &["add", "other.txt"]).unwrap(); fs::write(repo.join("other.txt"), "unstaged other\n").unwrap();
        fs::write(repo.join("selected new.txt"), "selected new\n").unwrap(); fs::write(repo.join("other new.txt"), "other new\n").unwrap();
        let token = git_tools::inspect(&git, repo).unwrap().review_token;
        save_selected(&git, repo, &["file.txt".into(), "selected new.txt".into()], "Selected", &token).unwrap();
        assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "base\n"); assert!(!repo.join("selected new.txt").exists()); assert_eq!(text(&git, repo, &["show", ":other.txt"]).unwrap(), "staged other"); assert_eq!(fs::read_to_string(repo.join("other.txt")).unwrap(), "unstaged other\n"); assert!(repo.join("other new.txt").exists());
        let hash = text(&git, repo, &["rev-parse", "refs/stash"]).unwrap(); let preview = preview(&git, repo, &hash).unwrap(); assert!(preview.files.iter().all(|f| f.path != "other.txt" && f.path != "other new.txt"));
        assert_eq!(text(&git, repo, &["show", &format!("{hash}^2:file.txt")]).unwrap(), "selected staged"); assert_eq!(text(&git, repo, &["show", &format!("{hash}:file.txt")]).unwrap(), "selected working");
    }
    #[test]
    fn rejects_stale_or_invalid_selection_without_mutation() {
        let (root, git) = fixture(); let repo = root.path(); fs::write(repo.join("file.txt"), "first\n").unwrap();
        let token = git_tools::inspect(&git, repo).unwrap().review_token; fs::write(repo.join("file.txt"), "second\n").unwrap();
        assert!(save_selected(&git, repo, &["file.txt".into()], "Save", &token).unwrap_err().contains("Repository changed"));
        let token = git_tools::inspect(&git, repo).unwrap().review_token;
        for paths in [vec![], vec!["../outside".into()], vec![":(glob)*".into()], vec!["missing.txt".into()]] { assert!(save_selected(&git, repo, &paths, "Save", &token).is_err()); }
        assert!(git_tools::inspect(&git, repo).unwrap().stashes.is_empty()); assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "second\n");
    }
    #[test]
    fn selected_rename_is_stashed_with_both_names() {
        let (root, git) = fixture(); let repo = root.path(); run(&git, repo, &["mv", "file.txt", "[renamed].txt"]).unwrap();
        let token = git_tools::inspect(&git, repo).unwrap().review_token; save_selected(&git, repo, &["[renamed].txt".into()], "Rename", &token).unwrap();
        assert!(repo.join("file.txt").exists()); assert!(!repo.join("[renamed].txt").exists());
        let hash = text(&git, repo, &["rev-parse", "refs/stash"]).unwrap(); assert!(diff(&git, repo, &hash, "[renamed].txt", "working").unwrap().text.contains("rename from file.txt"));
        assert!(version_control::changes(&git, repo).unwrap().files.is_empty());
        run(&git, repo, &["stash", "apply", "--index", &hash]).unwrap();
        assert!(!repo.join("file.txt").exists()); assert_eq!(fs::read_to_string(repo.join("[renamed].txt")).unwrap(), "base\n");
        assert!(version_control::changes(&git, repo).unwrap().files.iter().any(|f| f.path == "[renamed].txt" && f.status.starts_with('R')));
    }
    #[test]
    fn selected_staged_deletion_restores_base_and_can_apply_with_index() {
        let (root, git) = fixture(); let repo = root.path(); run(&git, repo, &["rm", "file.txt"]).unwrap();
        let token = git_tools::inspect(&git, repo).unwrap().review_token;
        save_selected(&git, repo, &["file.txt".into()], "Delete", &token).unwrap();
        assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "base\n"); assert!(version_control::changes(&git, repo).unwrap().files.is_empty());
        let hash = text(&git, repo, &["rev-parse", "refs/stash"]).unwrap();
        assert!(preview(&git, repo, &hash).unwrap().files.iter().any(|f| f.path == "file.txt" && f.status == "D" && f.area == "index"));
        run(&git, repo, &["stash", "apply", "--index", &hash]).unwrap(); assert!(!repo.join("file.txt").exists());
        assert_eq!(version_control::changes(&git, repo).unwrap().files[0].status, "D ");
    }
}
