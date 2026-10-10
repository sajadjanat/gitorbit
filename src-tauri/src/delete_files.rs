use crate::{git_tools, version_control};
use serde::{Deserialize, Serialize};
use std::{collections::{HashSet, hash_map::DefaultHasher}, fs, hash::{Hash, Hasher}, path::{Component, Path, PathBuf}};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Review { pub review_token: String, pub paths: Vec<String> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request { pub review_token: String, pub paths: Vec<String> }

fn regular_file(repo: &Path, path: &str) -> Result<PathBuf, String> {
    if path.is_empty() || path.len() > 4096 || path.contains(['\0', '\\', ':']) || path.starts_with('/')
        || !Path::new(path).components().all(|c| matches!(c, Component::Normal(_)))
        || path.split('/').any(|c| c.is_empty() || c == "." || c == ".." || c.eq_ignore_ascii_case(".git")) {
        return Err("Choose a repository-relative file path.".into());
    }
    let root = fs::canonicalize(repo).map_err(|e| e.to_string())?;
    let mut target = root.clone();
    for part in path.split('/') {
        target.push(part);
        let meta = fs::symlink_metadata(&target).map_err(|_| "A selected file is missing. Refresh the file list.")?;
        let mut linked = meta.file_type().is_symlink();
        #[cfg(windows)] { use std::os::windows::fs::MetadataExt; linked |= meta.file_attributes() & 0x400 != 0; }
        if linked { return Err("Deleting symbolic links or linked folders is not supported here.".into()); }
    }
    if !fs::metadata(&target).map_err(|e| e.to_string())?.is_file() {
        return Err("Select regular files to delete. Folders and submodules are not supported.".into());
    }
    if !fs::canonicalize(&target).map_err(|e| e.to_string())?.starts_with(&root) {
        return Err("Choose a file inside this repository.".into());
    }
    Ok(target)
}

pub fn review(git: &Path, repo: &Path, paths: &[String]) -> Result<Review, String> {
    if paths.is_empty() || paths.len() > 2000 { return Err("Select up to 2000 changed or unversioned files to delete.".into()); }
    let changes = version_control::changes(git, repo)?;
    let mut seen = HashSet::new(); let mut selected = Vec::new();
    for path in paths {
        if !seen.insert(path.clone()) { continue; }
        regular_file(repo, path)?;
        let file = changes.files.iter().find(|f| f.path == *path).ok_or("Select a file from Changes or Unversioned files.")?;
        if ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].contains(&file.status.as_str()) {
            return Err("Resolve conflicts before deleting files.".into());
        }
        selected.push(path.clone());
    }
    let state = git_tools::inspect(git, repo)?;
    if state.operation.is_some() { return Err("Finish or abort the current Git operation before deleting files.".into()); }
    let mut token = DefaultHasher::new();
    ("delete-files", &state.review_token, &selected).hash(&mut token);
    Ok(Review { review_token: format!("{:016x}", token.finish()), paths: selected })
}

pub fn apply(git: &Path, repo: &Path, request: &Request) -> Result<String, String> {
    let reviewed = review(git, repo, &request.paths)?;
    if reviewed.review_token != request.review_token { return Err("Repository changed. Refresh and review the operation again.".into()); }
    // Validate the entire selection before the first removal. The index is never changed.
    let targets = reviewed.paths.iter().map(|p| regular_file(repo, p)).collect::<Result<Vec<_>, _>>()?;
    for (index, (path, target)) in reviewed.paths.iter().zip(&targets).enumerate() {
        let result = regular_file(repo, path).and_then(|_| fs::remove_file(target).map_err(|e| e.to_string()));
        if let Err(error) = result { return Err(format!("Deleted {index} file(s) before an error at {path}: {error}")); }
    }
    Ok("Selected files deleted. Review and stage tracked deletions when ready.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{git, version_control::run};
    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let root = tempfile::tempdir().unwrap(); let (git, _) = git::find_git().unwrap();
        run(&git, root.path(), &["init", "-q", "-b", "main"]).unwrap();
        for args in [["config", "user.name", "Delete Test"], ["config", "user.email", "delete@example.com"], ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"]] { run(&git, root.path(), &args).unwrap(); }
        for name in ["tracked.txt", "other.txt", "clean.txt"] { fs::write(root.path().join(name), "base").unwrap(); }
        run(&git, root.path(), &["add", "."]).unwrap(); run(&git, root.path(), &["commit", "-qm", "Root"]).unwrap();
        (root, git)
    }
    fn request(git: &Path, repo: &Path, paths: &[&str]) -> Request {
        let review = review(git, repo, &paths.iter().map(|s| s.to_string()).collect::<Vec<_>>()).unwrap();
        Request { review_token: review.review_token, paths: review.paths }
    }
    #[test]
    fn deletes_tracked_and_unversioned_files_without_changing_index_or_other_work() {
        let (root, git) = fixture(); let repo = root.path();
        fs::write(repo.join("tracked.txt"), "staged").unwrap(); run(&git, repo, &["add", "tracked.txt"]).unwrap();
        fs::write(repo.join("tracked.txt"), "working").unwrap(); fs::write(repo.join("other.txt"), "preserve").unwrap();
        let new = "new [x] ' space.txt"; fs::write(repo.join(new), b"\0binary\xff").unwrap();
        let index = run(&git, repo, &["write-tree"]).unwrap();
        let r = request(&git, repo, &["tracked.txt", new]);
        assert!(repo.join(new).exists()); apply(&git, repo, &r).unwrap();
        assert!(!repo.join("tracked.txt").exists() && !repo.join(new).exists());
        assert_eq!(run(&git, repo, &["write-tree"]).unwrap(), index);
        assert_eq!(fs::read_to_string(repo.join("other.txt")).unwrap(), "preserve");
        let state = version_control::changes(&git, repo).unwrap();
        assert!(state.files.iter().any(|f| f.path == "tracked.txt" && f.status == "MD"));
    }
    #[test]
    fn refuses_stale_content_and_retargeted_reviews() {
        let (root, git) = fixture(); let repo = root.path();
        for name in ["one.txt", "two.txt"] { fs::write(repo.join(name), "first").unwrap(); }
        let mut r = request(&git, repo, &["one.txt"]); r.paths = vec!["two.txt".into()];
        assert!(apply(&git, repo, &r).unwrap_err().contains("Repository changed"));
        let r = request(&git, repo, &["one.txt"]); fs::write(repo.join("one.txt"), "later").unwrap();
        assert!(apply(&git, repo, &r).unwrap_err().contains("Repository changed"));
        assert!(repo.join("one.txt").exists() && repo.join("two.txt").exists());
    }
    #[test]
    fn validates_every_file_and_rejects_clean_ignored_directory_and_outside_paths() {
        let (root, git) = fixture(); let repo = root.path(); fs::write(repo.join("new.txt"), "keep").unwrap();
        fs::write(repo.join(".gitignore"), "ignored.txt\n").unwrap(); fs::write(repo.join("ignored.txt"), "keep").unwrap();
        fs::create_dir(repo.join("folder")).unwrap(); fs::write(repo.join("folder/child"), "keep").unwrap();
        for path in ["clean.txt", "ignored.txt", "folder", "../outside", ".git/config", "C:/outside", "folder/../new.txt"] {
            assert!(review(&git, repo, &["new.txt".into(), path.into()]).is_err(), "{path}");
        }
        let mut r = request(&git, repo, &["new.txt", "folder/child"]); fs::remove_file(repo.join("folder/child")).unwrap();
        assert!(apply(&git, repo, &r).is_err()); assert!(repo.join("new.txt").exists());
        r.paths.clear(); assert!(apply(&git, repo, &r).is_err());
    }
    #[test]
    fn supports_unborn_repositories_and_staged_new_files() {
        let root = tempfile::tempdir().unwrap(); let (git, _) = git::find_git().unwrap(); let repo = root.path();
        run(&git, repo, &["init", "-q", "-b", "main"]).unwrap();
        fs::write(repo.join("new.txt"), "new").unwrap(); run(&git, repo, &["add", "new.txt"]).unwrap();
        apply(&git, repo, &request(&git, repo, &["new.txt"])).unwrap();
        assert_eq!(run(&git, repo, &["show", ":new.txt"]).unwrap(), b"new");
        assert!(version_control::changes(&git, repo).unwrap().files.iter().any(|f| f.path == "new.txt" && f.status == "AD"));
    }
    #[test]
    fn refuses_in_progress_operations_and_handles_duplicates() {
        let (root, git) = fixture(); let repo = root.path(); fs::write(repo.join("new.txt"), "keep").unwrap();
        fs::write(repo.join(".git/MERGE_HEAD"), run(&git, repo, &["rev-parse", "HEAD"]).unwrap()).unwrap();
        assert!(review(&git, repo, &["new.txt".into()]).unwrap_err().contains("Finish or abort"));
        fs::remove_file(repo.join(".git/MERGE_HEAD")).unwrap();
        let r = request(&git, repo, &["new.txt", "new.txt"]); assert_eq!(r.paths.len(), 1);
        apply(&git, repo, &r).unwrap(); assert!(!repo.join("new.txt").exists());
    }
    #[cfg(windows)]
    #[test]
    fn reports_partial_failure_when_a_file_is_locked_against_deletion() {
        use std::os::windows::fs::OpenOptionsExt;
        let (root, git) = fixture(); let repo = root.path();
        for name in ["first.txt", "locked.txt"] { fs::write(repo.join(name), "keep").unwrap(); }
        let r = request(&git, repo, &["first.txt", "locked.txt"]);
        let held = fs::OpenOptions::new().read(true).share_mode(3).open(repo.join("locked.txt")).unwrap();
        let result = apply(&git, repo, &r); drop(held);
        assert!(result.unwrap_err().starts_with("Deleted 1 file(s) before an error at locked.txt:"));
        assert!(!repo.join("first.txt").exists());
        assert_eq!(fs::read_to_string(repo.join("locked.txt")).unwrap(), "keep");
    }
    #[cfg(windows)]
    #[test]
    fn rejects_windows_directory_junctions() {
        use std::os::windows::process::CommandExt;
        let (root, git) = fixture(); let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("keep.txt"), "keep").unwrap(); let link = root.path().join("linked-folder");
        let result = std::process::Command::new("cmd").creation_flags(0x08000000).args(["/c", "mklink", "/J"]).arg(&link).arg(outside.path()).output().unwrap();
        assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
        let result = review(&git, root.path(), &["linked-folder/keep.txt".into()]);
        // Remove the junction itself before the disposable repository is cleaned up.
        fs::remove_dir(&link).unwrap();
        assert!(result.unwrap_err().contains("linked folders"));
        assert_eq!(fs::read_to_string(outside.path().join("keep.txt")).unwrap(), "keep");
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_targets_and_ancestors() {
        use std::os::unix::fs::symlink;
        let (root, git) = fixture(); let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("keep.txt"), "keep").unwrap();
        symlink(outside.path().join("keep.txt"), root.path().join("link")).unwrap();
        symlink(outside.path(), root.path().join("linked-folder")).unwrap();
        for path in ["link", "linked-folder/keep.txt"] { assert!(review(&git, root.path(), &[path.into()]).is_err()); }
        assert_eq!(fs::read_to_string(outside.path().join("keep.txt")).unwrap(), "keep");
    }
}
