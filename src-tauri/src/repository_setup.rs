use crate::{git, remotes, version_control::run};
use command_group::CommandGroup;
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, process::Stdio, thread, time::{Duration, Instant}};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupRequest { pub action: String, pub folder: String, pub url: String, pub initial_branch: String }
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupResult { pub path: String, pub action: String }
fn git_path(path: &Path) -> PathBuf {
    #[cfg(windows)] {
        let value=path.to_string_lossy();
        if let Some(rest)=value.strip_prefix(r"\\?\UNC\") { return PathBuf::from(format!(r"\\{rest}")); }
        PathBuf::from(value.strip_prefix(r"\\?\").unwrap_or(&value))
    }
    #[cfg(not(windows))] { path.to_path_buf() }
}
fn destination(workspace: &Path, name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.len() > 255 || name != name.trim() || name.starts_with('.') || name.ends_with(['.', ' ']) || name.chars().any(|c| c.is_control() || "\\/:*?\"<>|".contains(c)) {
        return Err("Choose a simple child folder name without path separators.".into());
    }
    let device = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if ["CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"].contains(&device.as_str()) { return Err("Choose a simple child folder name without path separators.".into()); }
    let root = fs::canonicalize(workspace).map_err(|_| "Choose an existing workspace folder.")?;
    if !root.is_dir() { return Err("Choose an existing workspace folder.".into()); }
    Ok(root.join(name))
}
fn reject_nested_repository(git: &Path, path: &Path) -> Result<(), String> {
    if path.join(".git").exists() || run(git, path, &["rev-parse", "--git-dir"]).is_ok() {
        return Err("This folder is already inside a Git repository. Choose a separate project folder.".into());
    }
    Ok(())
}
fn wait(mut command: std::process::Command, timeout: Duration) -> Result<(), String> {
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let mut child = command.group_spawn().map_err(|_| "Could not start Git. Check your Git installation.")?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return if status.success() { Ok(()) } else { Err("Git could not complete repository setup. Check the address, access permissions, credential manager, and network. Any remaining destination folder is kept; inspect it before retrying or choose a new folder name.".into()) },
            Ok(None) if start.elapsed() < timeout => thread::sleep(Duration::from_millis(50)),
            _ => { let _ = child.kill(); let _ = child.wait(); return Err("Repository setup timed out. Any remaining destination folder is kept. Inspect it before retrying or choose another folder name.".into()); }
        }
    }
}
pub fn execute(git: &Path, workspace: &Path, request: &SetupRequest) -> Result<SetupResult, String> {
    if !matches!(request.action.as_str(), "clone" | "init") { return Err("Unsupported repository setup operation.".into()); }
    let path = destination(workspace, &request.folder)?;
    match request.action.as_str() {
        "clone" => {
            remotes::validate_url(&request.url)?;
            // Reserve a fresh directory atomically; never reuse or remove existing user files.
            fs::create_dir(&path).map_err(|_| "The destination already exists or cannot be created. Choose a new folder name.")?;
            let root = path.parent().ok_or("Choose an existing workspace folder.")?;
            let mut cmd = git::git_command(git, &git_path(root));
            cmd.args(["clone", "--progress", "--", &request.url]).arg(git_path(&path));
            wait(cmd, Duration::from_secs(120))?;
        }
        "init" => {
            let meta = fs::symlink_metadata(&path).map_err(|_| "Choose an existing project folder inside this workspace.")?;
            if meta.file_type().is_symlink() || !meta.is_dir() { return Err("Choose a real project folder, not a symbolic link.".into()); }
            let actual = fs::canonicalize(&path).map_err(|_| "Choose an existing project folder inside this workspace.")?;
            if actual.parent() != path.parent() { return Err("Choose a real project folder inside this workspace.".into()); }
            reject_nested_repository(git, &actual)?;
            if request.initial_branch.is_empty() || request.initial_branch.starts_with('-') || request.initial_branch.len() > 255 {
                return Err("Enter a valid initial branch name.".into());
            }
            run(git, &actual, &["check-ref-format", &format!("refs/heads/{}", request.initial_branch)]).map_err(|_| "Enter a valid initial branch name.")?;
            let mut cmd = git::git_command(git, &git_path(&actual)); cmd.args(["init", "--initial-branch", &request.initial_branch]);
            wait(cmd, Duration::from_secs(30))?;
        }
        _ => unreachable!(),
    }
    Ok(SetupResult {path: git_path(&path).to_string_lossy().into_owned(), action: request.action.clone()})
}

#[cfg(test)]
mod tests {
    use super::*;
    fn req(action: &str, folder: &str, url: &str) -> SetupRequest { SetupRequest {action:action.into(),folder:folder.into(),url:url.into(),initial_branch:"main".into()} }
    #[test]
    fn init_preserves_existing_files_and_rejects_nested_or_existing_repo() {
        let dir=tempfile::tempdir().unwrap();let (g,_)=git::find_git().unwrap(); let path=dir.path().join("project");fs::create_dir(&path).unwrap();fs::write(path.join("keep.txt"),"keep").unwrap();
        execute(&g,dir.path(),&req("init","project","")).unwrap();
        assert_eq!(fs::read_to_string(path.join("keep.txt")).unwrap(),"keep");
        assert!(execute(&g,dir.path(),&req("init","project","")).is_err());
        let nested=path.join("nested");fs::create_dir(&nested).unwrap();assert!(execute(&g,&path,&req("init","nested","")).is_err());assert!(!nested.join(".git").exists());
    }
    #[test]
    fn clones_local_repo_without_overwriting_existing_destination() {
        let dir=tempfile::tempdir().unwrap();let (g,_)=git::find_git().unwrap();let source=dir.path().join("source");fs::create_dir(&source).unwrap();
        run(&g,&source,&["init","-q","-b","main"]).unwrap();
        for args in [["config","user.name","Test"],["config","user.email","test@example.invalid"],["config","commit.gpgsign","false"]] {run(&g,&source,&args).unwrap();}
        fs::write(source.join("file.txt"),"tracked").unwrap();run(&g,&source,&["add","--","file.txt"]).unwrap();run(&g,&source,&["commit","-qm","Initial"]).unwrap();
        let request=req("clone","copy",source.to_str().unwrap());execute(&g,dir.path(),&request).unwrap();assert_eq!(fs::read_to_string(dir.path().join("copy/file.txt")).unwrap(),"tracked");
        assert!(execute(&g,dir.path(),&request).is_err());
    }
    #[test]
    fn rejects_escape_and_credentials_before_creating_any_folder() {
        let dir=tempfile::tempdir().unwrap();let (g,_)=git::find_git().unwrap();
        for folder in ["../escape","a/b","a\\b","..","CON","LPT1.txt","ending."] {assert!(execute(&g,dir.path(),&req("clone",folder,"https://example.invalid/repo.git")).is_err());}
        assert!(execute(&g,dir.path(),&req("clone","secret","https://user:secret@example.invalid/repo.git")).is_err());assert!(!dir.path().join("secret").exists());
    }
    #[test]
    fn failed_clone_leaves_reserved_folder_for_inspection() {
        let dir=tempfile::tempdir().unwrap();let (g,_)=git::find_git().unwrap();let missing=dir.path().join("missing");
        assert!(execute(&g,dir.path(),&req("clone","failed",missing.to_str().unwrap())).unwrap_err().contains("kept"));assert!(dir.path().join("failed").is_dir());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_project_folder() {
        let root=tempfile::tempdir().unwrap();let external=tempfile::tempdir().unwrap();let (g,_)=git::find_git().unwrap();std::os::unix::fs::symlink(external.path(),root.path().join("linked")).unwrap();
        assert!(execute(&g,root.path(),&req("init","linked","")).is_err());assert!(!external.path().join(".git").exists());
    }
}
