use crate::{git, git_tools, stash_tools, version_control::{self, run, CommitDiff}};
use serde::{Deserialize, Serialize};
use std::path::Path;

const PREFIX: &str = "refs/gitorbit/shelves/";
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shelf { pub id: String, pub hash: String, pub title: String, pub timestamp: u64 }
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shelves { pub review_token: String, pub entries: Vec<Shelf> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request { pub action: String, pub id: String, pub review_token: String, pub paths: Vec<String>, pub message: String }
fn text(git: &Path, repo: &Path, args: &[&str]) -> Result<String, String> { Ok(String::from_utf8_lossy(&run(git, repo, args)?).trim().into()) }
pub fn inspect(git: &Path, repo: &Path) -> Result<Shelves, String> {
    let state = git_tools::inspect(git, repo)?;
    let output = text(git, repo, &["for-each-ref", "--sort=-refname", "--format=%(refname)%00%(objectname)%00%(committerdate:unix)%00%(subject)", PREFIX])?;
    let mut entries = vec![];
    for line in output.lines() {
        let parts: Vec<_> = line.splitn(4, '\0').collect();
        if parts.len() != 4 { return Err("Could not read the shelf list.".into()); }
        entries.push(Shelf {id: parts[0].into(), hash: parts[1].into(), timestamp: parts[2].parse().unwrap_or(0), title: parts[3].into()});
    }
    let review_token = format!("{}|{}", state.review_token, entries.iter().map(|s|format!("{}:{}",s.id,s.hash)).collect::<Vec<_>>().join("|"));
    Ok(Shelves {review_token, entries})
}
fn selected<'a>(state: &'a Shelves, id: &str) -> Result<&'a Shelf, String> {
    state.entries.iter().find(|s| s.id == id).ok_or_else(||"This shelf no longer exists. Refresh the shelf list.".into())
}
pub fn preview(git: &Path, repo: &Path, id: &str) -> Result<stash_tools::StashPreview, String> {
    let state = inspect(git, repo)?; let entry = selected(&state,id)?;
    stash_tools::preview_snapshot(git,repo,&entry.hash,&entry.title,state.review_token.clone())
}
pub fn diff(git: &Path, repo: &Path, id: &str, file: &str, area: &str) -> Result<CommitDiff, String> {
    stash_tools::diff_snapshot(git,repo,preview(git,repo,id)?,file,area)
}
pub fn execute(git: &Path, repo: &Path, request: &Request) -> Result<String, String> {
    let shelves = inspect(git,repo)?;
    if request.review_token != shelves.review_token { return Err("Repository changed. Refresh and review the operation again.".into()); }
    let state = git_tools::inspect(git,repo)?;
    if request.action == "save" {
        if request.message.trim().is_empty() { return Err("Enter a shelf name.".into()); }
        stash_tools::shelve_selected(git,repo,&request.paths,&request.message,&state.review_token)?;
        return Ok("Selected files shelved. Other local changes were kept.".into());
    }
    let entry = selected(&shelves,&request.id)?;
    match request.action.as_str() {
        "apply" => {
            if state.operation.is_some() || state.conflicts > 0 { return Err("Finish or abort the current Git operation first.".into()); }
            let snapshot = preview(git,repo,&request.id)?;
            let affected: Vec<_> = snapshot.files.iter().flat_map(|f| std::iter::once(f.path.as_str()).chain(f.original_path.as_deref())).collect();
            let changes = version_control::changes(git,repo)?;
            let overlaps = |p: &str| affected.iter().any(|f| p == *f || p.starts_with(&format!("{f}/")) || f.starts_with(&format!("{p}/")));
            if changes.files.iter().any(|f| overlaps(&f.path) || f.original_path.as_deref().is_some_and(overlaps)) {
                return Err("The shelf overlaps local changes. Commit or shelve those files first.".into());
            }
            if inspect(git,repo)?.review_token != request.review_token { return Err("Repository changed. Refresh and review the operation again.".into()); }
            // The shelf remains a durable ref even if applying on another base conflicts.
            stash_tools::restore_snapshot(git,repo,&snapshot,&state.review_token).map_err(|e|format!("{e}\nThe shelf is preserved. Refresh and resolve any conflicts before retrying."))?;
            Ok("Shelf restored with its staging state. The shelf remains available.".into())
        }
        "delete" => {
            let recovery = format!("refs/gitorbit/recovery/{}-shelf-{}",git::now_ms(),&entry.hash[..8]);
            run(git,repo,&["update-ref",&recovery,&entry.hash])?;
            run(git,repo,&["update-ref","-d",&entry.id,&entry.hash])?;
            Ok("Shelf removed. A recovery reference preserves its contents.".into())
        }
        _ => Err("Choose a supported shelf action.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*; use std::fs;
    fn fixture() -> (tempfile::TempDir,std::path::PathBuf) {
        let root=tempfile::tempdir().unwrap(); let (git,_)=git::find_git().unwrap(); let repo=root.path();
        for args in [&["init","-q","-b","main"][..],&["config","user.name","Shelf Test"],&["config","user.email","shelf@example.invalid"],&["config","commit.gpgsign","false"],&["config","core.autocrlf","false"]] {run(&git,repo,args).unwrap();}
        for file in ["selected.txt","other.txt","deleted.txt"] {fs::write(repo.join(file),format!("{file} base\n")).unwrap();}
        run(&git,repo,&["add","."]).unwrap();run(&git,repo,&["commit","-qm","Base"]).unwrap(); (root,git)
    }
    fn action(git:&Path,repo:&Path,kind:&str,id:&str,paths:&[&str])->Result<String,String> {
        execute(git,repo,&Request{action:kind.into(),id:id.into(),paths:paths.iter().map(|s|s.to_string()).collect(),message:"Work in progress".into(),review_token:inspect(git,repo)?.review_token})
    }
    #[test]
    fn shelves_selected_layers_and_untracked_without_polluting_stashes_and_restores_with_unrelated_work() {
        let (root,git)=fixture();let repo=root.path();
        fs::write(repo.join("selected.txt"),"staged\n").unwrap();run(&git,repo,&["add","selected.txt"]).unwrap();fs::write(repo.join("selected.txt"),"working\n").unwrap();
        fs::write(repo.join("new.txt"),"new\n").unwrap();fs::write(repo.join("other.txt"),"unrelated staged\n").unwrap();run(&git,repo,&["add","other.txt"]).unwrap();fs::write(repo.join("other.txt"),"unrelated\n").unwrap();
        action(&git,repo,"save","",&["selected.txt","new.txt"]).unwrap();
        assert!(git_tools::inspect(&git,repo).unwrap().stashes.is_empty());
        let shelves=inspect(&git,repo).unwrap();assert_eq!(shelves.entries.len(),1);let id=&shelves.entries[0].id;
        let view=preview(&git,repo,id).unwrap();assert!(view.files.iter().all(|f|f.path!="other.txt"));assert!(view.files.iter().any(|f|f.area=="index"));
        assert!(diff(&git,repo,id,"selected.txt","working").unwrap().text.contains("+working"));assert!(!repo.join("new.txt").exists());
        action(&git,repo,"apply",id,&[]).unwrap();
        assert_eq!(text(&git,repo,&["show",":selected.txt"]).unwrap(),"staged");assert_eq!(fs::read_to_string(repo.join("selected.txt")).unwrap(),"working\n");
        assert_eq!(fs::read_to_string(repo.join("other.txt")).unwrap(),"unrelated\n");assert!(repo.join("new.txt").exists());assert_eq!(inspect(&git,repo).unwrap().entries.len(),1);
        assert_eq!(text(&git,repo,&["show",":other.txt"]).unwrap(),"unrelated staged");
    }
    #[test]
    fn refuses_ignored_file_collisions_and_stale_restore_without_changing_tracked_files() {
        let(root,git)=fixture();let repo=root.path();
        fs::write(repo.join("selected.txt"),"shelved\n").unwrap();fs::write(repo.join("new.txt"),"saved new\n").unwrap();
        action(&git,repo,"save","",&["selected.txt","new.txt"]).unwrap();
        let shelf=inspect(&git,repo).unwrap().entries.remove(0);
        fs::write(repo.join(".git/info/exclude"),"new.txt\n").unwrap();fs::write(repo.join("new.txt"),"local ignored\n").unwrap();
        assert!(action(&git,repo,"apply",&shelf.id,&[]).unwrap_err().contains("already exists locally"));
        assert_eq!(fs::read_to_string(repo.join("new.txt")).unwrap(),"local ignored\n");
        assert_eq!(fs::read_to_string(repo.join("selected.txt")).unwrap(),"selected.txt base\n");
        assert_eq!(text(&git,repo,&["show",":selected.txt"]).unwrap(),"selected.txt base");
        fs::remove_file(repo.join("new.txt")).unwrap();
        let snapshot=preview(&git,repo,&shelf.id).unwrap();let token=git_tools::inspect(&git,repo).unwrap().review_token;
        fs::write(repo.join("other.txt"),"later local edit\n").unwrap();
        assert!(stash_tools::restore_snapshot(&git,repo,&snapshot,&token).unwrap_err().contains("Repository changed"));
        assert_eq!(fs::read_to_string(repo.join("selected.txt")).unwrap(),"selected.txt base\n");assert!(!repo.join("new.txt").exists());
        assert_eq!(fs::read_to_string(repo.join("other.txt")).unwrap(),"later local edit\n");
        action(&git,repo,"apply",&shelf.id,&[]).unwrap();
        assert_eq!(fs::read_to_string(repo.join("new.txt")).unwrap(),"saved new\n");assert_eq!(inspect(&git,repo).unwrap().entries.len(),1);
    }
    #[test]
    fn rename_and_deletion_survive_shelving_and_unshelving() {
        let(root,git)=fixture();let repo=root.path();run(&git,repo,&["mv","selected.txt","renamed.txt"]).unwrap();run(&git,repo,&["rm","-q","deleted.txt"]).unwrap();
        action(&git,repo,"save","",&["renamed.txt","deleted.txt"]).unwrap();assert!(repo.join("selected.txt").exists());assert!(repo.join("deleted.txt").exists());
        let id=inspect(&git,repo).unwrap().entries[0].id.clone();action(&git,repo,"apply",&id,&[]).unwrap();assert!(repo.join("renamed.txt").exists());assert!(!repo.join("selected.txt").exists());assert!(!repo.join("deleted.txt").exists());
    }
    #[test]
    fn refuses_stale_overlapping_and_unknown_shelves_and_delete_preserves_recovery() {
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("selected.txt"),"shelved\n").unwrap();action(&git,repo,"save","",&["selected.txt"]).unwrap();
        let state=inspect(&git,repo).unwrap();let shelf=&state.entries[0];fs::write(repo.join("selected.txt"),"local\n").unwrap();
        let request=Request{action:"apply".into(),id:shelf.id.clone(),paths:vec![],message:String::new(),review_token:state.review_token};assert!(execute(&git,repo,&request).unwrap_err().contains("Repository changed"));
        assert!(action(&git,repo,"apply",&shelf.id,&[]).unwrap_err().contains("overlaps"));assert!(action(&git,repo,"delete","refs/heads/main",&[]).is_err());
        action(&git,repo,"delete",&shelf.id,&[]).unwrap();assert!(inspect(&git,repo).unwrap().entries.is_empty());
        assert!(text(&git,repo,&["for-each-ref","--format=%(objectname)","refs/gitorbit/recovery/"]).unwrap().contains(&shelf.hash));assert_eq!(fs::read_to_string(repo.join("selected.txt")).unwrap(),"local\n");
    }
    #[test]
    fn preserves_shelf_when_another_commit_causes_restore_conflicts() {
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("selected.txt"),"shelf version\n").unwrap();action(&git,repo,"save","",&["selected.txt"]).unwrap();
        let shelf=inspect(&git,repo).unwrap().entries.remove(0);fs::write(repo.join("selected.txt"),"new committed version\n").unwrap();run(&git,repo,&["add","selected.txt"]).unwrap();run(&git,repo,&["commit","-qm","New base"]).unwrap();
        let error=action(&git,repo,"apply",&shelf.id,&[]).unwrap_err();assert!(error.contains("shelf is preserved"));assert_eq!(inspect(&git,repo).unwrap().entries[0].hash,shelf.hash);
        assert!(git_tools::inspect(&git,repo).unwrap().conflicts>0);assert!(action(&git,repo,"apply",&shelf.id,&[]).is_err());
    }
}
