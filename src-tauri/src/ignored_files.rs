use crate::{git_tools, version_control::{self, run}};
use serde::{Deserialize, Serialize};
use std::{collections::{HashSet, hash_map::DefaultHasher}, fs, hash::{Hash, Hasher}, path::{Path, PathBuf}};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {pub review_token: String, pub target: String, pub patterns: Vec<String>, pub paths: Vec<String>}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {pub review_token: String, pub target: String, pub paths: Vec<String>}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {pub files: Vec<String>, pub has_more: bool}

fn target_path(git: &Path, repo: &Path, target: &str) -> Result<PathBuf, String> {
    match target {"shared" => Ok(repo.join(".gitignore")), "local" => version_control::git_path(git, repo, "info/exclude"), _ => Err("Choose shared or local ignore rules.".into())}
}
fn no_symlinks(path: &Path) -> Result<(), String> {
    for parent in path.ancestors() {
        match fs::symlink_metadata(parent) {
            Ok(metadata) if metadata.file_type().is_symlink() => return Err("Ignoring through symbolic links is not supported.".into()),
            Ok(_) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}
fn read_target(path: &Path) -> Result<Option<Vec<u8>>, String> {
    no_symlinks(path)?;
    match fs::read(path) {
        Ok(content) if content.len() <= 1_048_576 => Ok(Some(content)),
        Ok(_) => Err("The ignore file is too large to edit safely.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}
fn pattern(path: &str) -> Result<String, String> {
    if path.is_empty() || path.contains(['\r', '\n', '\0']) || path.split('/').any(|part| part.is_empty() || part == "." || part == "..") {
        return Err("Choose a valid unversioned file path.".into());
    }
    let mut pattern = String::from("/");
    for character in path.chars() {
        if matches!(character, '\\' | '*' | '?' | '[' | ']' | '!' | '#' | ' ' | '\t') {pattern.push('\\');}
        pattern.push(character);
    }
    Ok(pattern)
}
pub fn review(git: &Path, repo: &Path, paths: &[String], target: &str) -> Result<Info, String> {
    if paths.is_empty() || paths.len() > 2000 {return Err("Select up to 2000 unversioned files to ignore.".into());}
    // Resolve the selected repository first: macOS uses system aliases such as
    // /var -> /private/var. Links inside the repository must still be refused.
    let root = fs::canonicalize(repo).map_err(|e| e.to_string())?;
    let repo = root.as_path();
    let state = git_tools::inspect(git, repo)?;
    let changes = version_control::changes(git, repo)?;
    let mut unique = HashSet::new(); let mut selected = Vec::new(); let mut patterns = Vec::new();
    for path in paths {
        if !unique.insert(path.clone()) {continue;}
        let file = changes.files.iter().find(|file| file.path == *path && file.status == "??")
            .ok_or("Only currently unversioned files can be ignored here.")?;
        let file_path = repo.join(&file.path); no_symlinks(&file_path)?;
        if !fs::symlink_metadata(&file_path).map_err(|e| e.to_string())?.is_file() {return Err("Choose an unversioned regular file to ignore.".into());}
        let root = fs::canonicalize(repo).map_err(|e| e.to_string())?;
        if !fs::canonicalize(&file_path).map_err(|e| e.to_string())?.starts_with(&root) {return Err("Choose a file inside this repository.".into());}
        patterns.push(pattern(path)?); selected.push(path.clone());
    }
    let target_path = target_path(git, repo, target)?;
    let bytes = read_target(&target_path)?;
    let mut token = DefaultHasher::new();
    (&state.review_token, &target_path, &bytes, &selected, target).hash(&mut token);
    Ok(Info {review_token: format!("{:016x}", token.finish()), target: target.into(), patterns, paths: selected})
}
pub fn apply(git: &Path, repo: &Path, request: &Request) -> Result<String, String> {
    let root = fs::canonicalize(repo).map_err(|e| e.to_string())?;
    let repo = root.as_path();
    let reviewed = review(git, repo, &request.paths, &request.target)?;
    if reviewed.review_token != request.review_token {return Err("Repository changed. Refresh and review the operation again.".into());}
    let target = target_path(git, repo, &request.target)?;
    let original = read_target(&target)?.unwrap_or_default();
    let newline: &[u8] = if original.windows(2).any(|pair| pair == b"\r\n") {b"\r\n"} else {b"\n"};
    let mut content = original.clone();
    let missing: Vec<_> = reviewed.patterns.iter().filter(|pattern| !original.split(|byte| *byte == b'\n').any(|line| line.strip_suffix(b"\r").unwrap_or(line) == pattern.as_bytes())).collect();
    if missing.is_empty() {return Ok("Selected files already have exact ignore rules.".into());}
    if !content.is_empty() && !content.ends_with(b"\n") {content.extend_from_slice(newline);}
    for pattern in missing {content.extend_from_slice(pattern.as_bytes());content.extend_from_slice(newline);}
    if let Some(parent) = target.parent() {fs::create_dir_all(parent).map_err(|e| e.to_string())?;}
    no_symlinks(&target)?;
    // Recheck the reviewed file immediately before writing, including absent vs empty state.
    let before = read_target(&target)?;
    let mut token = DefaultHasher::new();
    (&git_tools::inspect(git, repo)?.review_token, &target, &before, &reviewed.paths, request.target.as_str()).hash(&mut token);
    if format!("{:016x}", token.finish()) != request.review_token {return Err("Repository changed. Refresh and review the operation again.".into());}
    fs::write(&target, content).map_err(|e| e.to_string())?;
    Ok("Ignore rules saved. Existing tracked files are unchanged.".into())
}
pub fn inventory(git: &Path, repo: &Path) -> Result<Inventory, String> {
    let bytes = run(git, repo, &["ls-files", "--others", "--ignored", "--exclude-standard", "-z"])?;
    let mut all = bytes.split(|byte| *byte == 0).filter(|path| !path.is_empty());
    let files = all.by_ref().take(2000).map(|path| String::from_utf8_lossy(path).into_owned()).collect();
    Ok(Inventory {files, has_more: all.next().is_some()})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git;
    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let root = tempfile::tempdir().unwrap(); let (git, _) = git::find_git().unwrap();
        run(&git, root.path(), &["init", "-q", "-b", "main"]).unwrap();
        for args in [["config", "user.name", "Ignore Test"], ["config", "user.email", "ignore@example.com"], ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"]] {run(&git, root.path(), &args).unwrap();}
        fs::write(root.path().join("tracked.txt"), "keep").unwrap();run(&git, root.path(), &["add", "tracked.txt"]).unwrap();run(&git, root.path(), &["commit", "-qm", "Root"]).unwrap();
        (root, git)
    }
    fn request(git: &Path, repo: &Path, paths: &[&str], target: &str) -> Request {
        let info = review(git, repo, &paths.iter().map(|p| p.to_string()).collect::<Vec<_>>(), target).unwrap();
        Request {review_token: info.review_token, target: target.into(), paths: info.paths}
    }
    #[test]
    fn exact_patterns_escape_metacharacters_and_keep_other_files_visible() {
        let (root, git) = fixture();let repo = root.path();
        for name in ["[cache] #!.log", "cache #!.log", "normal.log"] {fs::write(repo.join(name), "private").unwrap();}
        apply(&git, repo, &request(&git, repo, &["[cache] #!.log"], "shared")).unwrap();
        assert_eq!(fs::read_to_string(repo.join(".gitignore")).unwrap(), "/\\[cache\\]\\ \\#\\!.log\n");
        let ignored = inventory(&git, repo).unwrap(); assert_eq!(ignored.files, ["[cache] #!.log"]);assert!(!ignored.has_more);
        assert!(version_control::changes(&git, repo).unwrap().files.iter().any(|f| f.path == "normal.log"));
        assert_eq!(fs::read_to_string(repo.join("[cache] #!.log")).unwrap(), "private");
    }
    #[test]
    fn local_rules_preserve_bytes_and_line_endings() {
        let (root, git) = fixture();let repo = root.path();fs::write(repo.join("private.log"), "private").unwrap();
        let target = target_path(&git, repo, "local").unwrap();fs::write(&target, b"# existing\r\nprevious\r\n# no final newline").unwrap();
        apply(&git, repo, &request(&git, repo, &["private.log"], "local")).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"# existing\r\nprevious\r\n# no final newline\r\n/private.log\r\n");
        assert!(!repo.join(".gitignore").exists());assert!(version_control::changes(&git, repo).unwrap().files.is_empty());
    }
    #[test]
    fn stale_local_ignore_file_changes_are_refused() {
        let (root, git) = fixture();let repo = root.path();fs::write(repo.join("private.log"), "private").unwrap();
        let r = request(&git, repo, &["private.log"], "local");let target = target_path(&git, repo, "local").unwrap();
        fs::write(&target, "# changed elsewhere\n").unwrap();
        assert!(apply(&git, repo, &r).unwrap_err().contains("Repository changed"));
        assert_eq!(fs::read_to_string(&target).unwrap(), "# changed elsewhere\n");
    }
    #[test]
    fn tracked_paths_and_outside_paths_are_refused() {
        let (root, git) = fixture();let repo = root.path();
        assert!(review(&git, repo, &["tracked.txt".into()], "shared").is_err());
        assert!(review(&git, repo, &["../outside".into()], "local").is_err());
        assert_eq!(fs::read_to_string(repo.join("tracked.txt")).unwrap(), "keep");
        assert_eq!(text_head(&git, repo), "Root");
    }
    fn text_head(git: &Path, repo: &Path) -> String {String::from_utf8_lossy(&run(git, repo, &["show", "-s", "--format=%s", "HEAD"]).unwrap()).trim().into()}
    #[test]
    fn inventory_is_explicitly_capped() {
        let (root, git) = fixture();let repo = root.path();fs::write(repo.join(".gitignore"), "ignored/\n").unwrap();fs::create_dir(repo.join("ignored")).unwrap();
        for n in 0..2001 {fs::write(repo.join("ignored").join(format!("{n}.txt")), "").unwrap();}
        let result = inventory(&git, repo).unwrap();assert_eq!(result.files.len(), 2000);assert!(result.has_more);
    }
    #[test]
    fn inventory_errors_are_returned() {
        let (root, git) = fixture();assert!(inventory(&git, &root.path().join("absent")).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn repository_aliases_allow_ignore_rules_without_allowing_linked_files() {
        use std::os::unix::fs::symlink;
        let (root, git) = fixture();
        let alias_parent = tempfile::tempdir().unwrap();
        let alias = alias_parent.path().join("repository");
        symlink(root.path(), &alias).unwrap();
        fs::write(root.path().join("private.log"), "private").unwrap();
        for target in ["shared", "local"] {
            let destination = target_path(&git, root.path(), target).unwrap();
            if destination.exists() { fs::remove_file(&destination).unwrap(); }
            let r = request(&git, &alias, &["private.log"], target);
            apply(&git, &alias, &r).unwrap();
            assert_eq!(fs::read(&destination).unwrap(), b"/private.log\n");
            fs::remove_file(&destination).unwrap();
        }
        symlink(root.path().join("private.log"), root.path().join("linked.log")).unwrap();
        assert!(review(&git, &alias, &["linked.log".into()], "shared").unwrap_err().contains("symbolic links"));
        assert_eq!(fs::read_to_string(root.path().join("private.log")).unwrap(), "private");
    }
    #[cfg(unix)]
    #[test]
    fn symbolic_link_files_and_ignore_targets_are_refused() {
        use std::os::unix::fs::symlink;
        let (root, git) = fixture();let repo = root.path();let outside = tempfile::tempdir().unwrap();fs::write(outside.path().join("target"), "preserve").unwrap();
        symlink(outside.path().join("target"), repo.join("link")).unwrap();assert!(review(&git, repo, &["link".into()], "shared").is_err());
        fs::write(repo.join("private.log"), "private").unwrap();symlink(outside.path().join("target"), repo.join(".gitignore")).unwrap();
        assert!(review(&git, repo, &["private.log".into()], "shared").is_err());assert_eq!(fs::read_to_string(outside.path().join("target")).unwrap(), "preserve");
    }
}
