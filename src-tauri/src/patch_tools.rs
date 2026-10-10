use crate::{git, git_tools, version_control::{self, run}};
use serde::Serialize;
use std::{collections::{HashSet, hash_map::DefaultHasher}, fs, hash::{Hash, Hasher}, path::{Component, Path, PathBuf}, sync::atomic::{AtomicU64, Ordering}};
const MAX_PATCH: usize = 8 * 1024 * 1024;
#[derive(Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct PatchExport { pub text: String, pub review_token: String, pub files: Vec<String> }
#[derive(Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct PatchPreview { pub review_token: String, pub patch_path: String, pub files: Vec<String>, pub stat: String, pub summary: String, pub can_apply: bool, pub error: Option<String> }
fn text(git: &Path, repo: &Path, args: &[&str]) -> Result<String, String> { Ok(String::from_utf8_lossy(&run(git, repo, args)?).trim().to_owned()) }
fn validate_path(repo: &Path, file: &str) -> Result<(), String> {
    if file.is_empty() || file.len()>4096 || file.contains(['\0','\\',':']) || file.starts_with('/')
        || !Path::new(file).components().all(|c| matches!(c,Component::Normal(_)))
        || file.split('/').any(|c| c.is_empty()||c=="."||c==".."||c.eq_ignore_ascii_case(".git")) { return Err("Patch paths must stay inside this repository and outside .git.".into()); }
    let root = fs::canonicalize(repo).map_err(|e| e.to_string())?; let mut current=root.clone();
    for segment in file.split('/') {
        current.push(segment);
        match fs::symlink_metadata(&current) {
            Ok(metadata)=>{
                if metadata.file_type().is_symlink() {return Err("Patches cannot target symbolic links or paths through symbolic links.".into());}
                let resolved=fs::canonicalize(&current).map_err(|e|e.to_string())?;
                if !resolved.starts_with(&root) {return Err("Patch paths must stay inside this repository and outside .git.".into());}
                if resolved.strip_prefix(&root).is_ok_and(|relative|relative.components().any(|part|part.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git"))){return Err("Patch paths must stay inside this repository and outside .git.".into());}
            },
            Err(error) if error.kind()==std::io::ErrorKind::NotFound=>break,
            Err(error)=>return Err(error.to_string()),
        }
    }
    Ok(())
}
fn reviewed(git: &Path, repo: &Path, token: &str) -> Result<git_tools::ToolsState,String> {
    let state=git_tools::inspect(git,repo)?;
    if state.review_token!=token{return Err("Repository changed. Refresh and review the operation again.".into());} Ok(state)
}
pub fn export(git: &Path, repo: &Path, paths: &[String], staged: bool, review_token: &str) -> Result<PatchExport,String> {
    let state=reviewed(git,repo,review_token)?;
    if paths.is_empty()||paths.len()>1000{return Err("Select between 1 and 1,000 tracked files to export.".into());}
    let changes=version_control::changes(git,repo)?;let mut files=vec![];let mut seen=HashSet::new();
    for path in paths {
        validate_path(repo,path)?;
        let file=changes.files.iter().find(|f| &f.path==path).ok_or("The selected files changed. Refresh the patch review.")?;
        if file.status=="??" {return Err("Stage unversioned files before exporting them as a patch.".into());}
        if seen.insert(path.clone()){files.push(path.clone());}
        if let Some(old)=&file.original_path{validate_path(repo,old)?;if seen.insert(old.clone()){files.push(old.clone());}}
    }
    let mut args=vec!["--literal-pathspecs","diff","--binary","--full-index","--no-ext-diff","--no-textconv","--no-color","--find-renames","--src-prefix=a/","--dst-prefix=b/"];
    if staged{args.push("--cached");}args.push("--");args.extend(files.iter().map(String::as_str));
    let bytes=run(git,repo,&args)?;
    if bytes.is_empty(){return Err("The selected files have no changes in this patch scope.".into());}
    if bytes.len()>MAX_PATCH{return Err("This patch exceeds the 8 MiB limit.".into());}
    reviewed(git,repo,&state.review_token)?;
    Ok(PatchExport{text:String::from_utf8(bytes).map_err(|_|"The exported patch is not UTF-8 text.")?,review_token:state.review_token,files})
}
struct PatchSnapshot { directory:PathBuf, path:PathBuf, bytes:Vec<u8> }
impl PatchSnapshot {
    fn read(source:&str)->Result<Self,String>{
        let path=Path::new(source);if !path.is_absolute(){return Err("Choose an absolute patch file path.".into());}
        let mut input=fs::File::open(path).map_err(|e|e.to_string())?;
        if !input.metadata().map_err(|e|e.to_string())?.is_file(){return Err("Choose a patch file.".into());}
        use std::io::Read;let mut bytes=vec![];input.by_ref().take((MAX_PATCH+1)as u64).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
        if bytes.len()>MAX_PATCH{return Err("This patch exceeds the 8 MiB limit.".into());}
        if bytes.is_empty()||bytes.contains(&0)||std::str::from_utf8(&bytes).is_err(){return Err("Choose a non-empty UTF-8 Git patch file.".into());}
        for line in String::from_utf8_lossy(&bytes).lines(){
            for prefix in ["--- ","+++ ","rename from ","rename to ","copy from ","copy to "]{
                if let Some(value)=line.strip_prefix(prefix){let value=value.trim_start_matches('"');if value.starts_with('/')&&value!="/dev/null"{return Err("Absolute patch paths are not supported.".into());}}
            }
            if line.starts_with("diff --git /")||line.starts_with("diff --git \"/"){return Err("Absolute patch paths are not supported.".into());}
        }
        static NEXT:AtomicU64=AtomicU64::new(0);let directory=std::env::temp_dir().join(format!("gitorbit-patch-{}-{}-{}",std::process::id(),git::now_ms(),NEXT.fetch_add(1,Ordering::Relaxed)));
        fs::create_dir(&directory).map_err(|e|e.to_string())?;let snapshot=Self{path:directory.join("review.patch"),directory,bytes};
        fs::write(&snapshot.path,&snapshot.bytes).map_err(|e|e.to_string())?;Ok(snapshot)
    }
    fn arg(&self)->Result<&str,String>{self.path.to_str().ok_or_else(||"The temporary patch path is not valid UTF-8.".into())}
}
impl Drop for PatchSnapshot{fn drop(&mut self){let _=fs::remove_dir_all(&self.directory);}}
fn numstat(bytes:&[u8])->Result<Vec<String>,String>{
    bytes.split(|b|*b==0).filter(|field|!field.is_empty()).map(|field|{
        let mut fields=field.splitn(3,|b|*b==b'\t');fields.next().ok_or("Incomplete patch statistics.")?;fields.next().ok_or("Incomplete patch statistics.")?;
        let path=fields.next().ok_or("Incomplete patch statistics.")?;String::from_utf8(path.to_vec()).map_err(|_|"Patch filenames must be valid UTF-8.".into())
    }).collect()
}
fn inspect(git:&Path,repo:&Path,source:&str,snapshot:&PatchSnapshot)->Result<PatchPreview,String>{
    let state=git_tools::inspect(git,repo)?;let arg=snapshot.arg()?;let mut files=vec![];let mut seen=HashSet::new();
    // Reverse numstat returns rename/copy sources that forward numstat omits.
    for reverse in [false,true]{
        let mut args=vec!["apply","--numstat","-z"];if reverse{args.push("--reverse");}args.extend(["--",arg]);
        for path in numstat(&run(git,repo,&args)?)?{validate_path(repo,&path)?;if seen.insert(path.clone()){files.push(path);}}
    }
    if files.is_empty(){return Err("This patch does not contain any file changes.".into());}
    let summary=text(git,repo,&["apply","--summary","--",arg])?;
    if summary.lines().any(|line|line.trim_start().starts_with("create mode 120000 ")||(line.trim_start().starts_with("mode change ")&&line.contains("120000"))){return Err("Patches that create or change symbolic links are not supported.".into());}
    for file in &files{
        if repo.join(file).is_file()&&run(git,repo,&["--literal-pathspecs","ls-files","--error-unmatch","--",file]).is_err(){return Err("Move or stage existing unversioned target files before applying this patch.".into());}
    }
    let stat=text(git,repo,&["apply","--stat","--",arg])?;
    let error=if state.operation.is_some(){Some("Finish or abort the current Git operation first.".into())}else if state.conflicts>0{Some("Resolve conflicts before applying a patch.".into())}else{run(git,repo,&["apply","--check","--whitespace=nowarn","--",arg]).err()};
    let mut fingerprint=DefaultHasher::new();state.review_token.hash(&mut fingerprint);snapshot.bytes.hash(&mut fingerprint);source.hash(&mut fingerprint);
    Ok(PatchPreview{review_token:format!("{:016x}",fingerprint.finish()),patch_path:source.into(),files,stat,summary,can_apply:error.is_none(),error})
}
pub fn preview(git:&Path,repo:&Path,patch_path:&str)->Result<PatchPreview,String>{let snapshot=PatchSnapshot::read(patch_path)?;inspect(git,repo,patch_path,&snapshot)}
pub fn apply(git:&Path,repo:&Path,patch_path:&str,review_token:&str)->Result<String,String>{
    let snapshot=PatchSnapshot::read(patch_path)?;let review=inspect(git,repo,patch_path,&snapshot)?;
    if review.review_token!=review_token{return Err("The repository or patch changed. Refresh and review the patch again.".into());}
    if !review.can_apply{return Err(review.error.unwrap_or_else(||"This patch cannot be applied.".into()));}
    let backup=if git_tools::inspect(git,repo)?.head.is_empty(){String::new()}else{text(git,repo,&["stash","create","GitOrbit before patch"])?};
    if !backup.is_empty(){run(git,repo,&["stash","store","-m","GitOrbit before patch",&backup])?;}
    run(git,repo,&["apply","--whitespace=nowarn","--",snapshot.arg()?]).map_err(|error|format!("{error}\nThe patch was not committed. Existing tracked changes were retained in the pre-patch stash when present. Refresh and inspect the files."))?;
    Ok(if backup.is_empty(){"Patch applied to the working tree. Stage and commit the changes when ready.".into()}else{"Patch applied to the working tree. Previous tracked changes are saved in the pre-patch stash.".into()})
}

#[cfg(test)]mod tests{
    use super::*;
    fn fixture()->(tempfile::TempDir,std::path::PathBuf){let root=tempfile::tempdir().unwrap();let(git,_)=git::find_git().expect("Git required");for args in [&["init","-q","-b","main"][..],&["config","user.name","Demo"],&["config","user.email","demo@example.test"],&["config","commit.gpgsign","false"],&["config","core.autocrlf","false"]]{run(&git,root.path(),args).unwrap();}fs::write(root.path().join("file.txt"),"base\n").unwrap();run(&git,root.path(),&["add","."]).unwrap();run(&git,root.path(),&["commit","-qm","Initial"]).unwrap();(root,git)}
    fn save_patch(text:&str)->tempfile::NamedTempFile{let file=tempfile::NamedTempFile::new().unwrap();fs::write(file.path(),text).unwrap();file}
    #[test]fn exports_staged_or_working_and_imports_without_committing(){
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("file.txt"),"staged\n").unwrap();run(&git,repo,&["add","file.txt"]).unwrap();fs::write(repo.join("file.txt"),"working\n").unwrap();let token=git_tools::inspect(&git,repo).unwrap().review_token;
        let staged=export(&git,repo,&["file.txt".into()],true,&token).unwrap();assert!(staged.text.contains("+staged"));let working=export(&git,repo,&["file.txt".into()],false,&token).unwrap();assert!(working.text.contains("-staged"));assert!(working.text.contains("+working"));
        run(&git,repo,&["reset","--hard","-q","HEAD"]).unwrap();let source=save_patch(&staged.text);let path=source.path().to_str().unwrap();let review=preview(&git,repo,path).unwrap();assert!(review.can_apply);assert_eq!(review.files,vec!["file.txt"]);let head=text(&git,repo,&["rev-parse","HEAD"]).unwrap();apply(&git,repo,path,&review.review_token).unwrap();assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(),"staged\n");assert_eq!(text(&git,repo,&["rev-parse","HEAD"]).unwrap(),head);assert!(text(&git,repo,&["diff","--cached"]).unwrap().is_empty());
    }
    #[test]fn refuses_stale_patch_or_repository_and_backs_up_existing_tracked_changes(){
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("file.txt"),"changed\n").unwrap();let token=git_tools::inspect(&git,repo).unwrap().review_token;let patch=export(&git,repo,&["file.txt".into()],false,&token).unwrap();run(&git,repo,&["restore","file.txt"]).unwrap();let source=save_patch(&patch.text);let path=source.path().to_str().unwrap();let review=preview(&git,repo,path).unwrap();fs::write(source.path(),patch.text.replace("+changed","+different")).unwrap();assert!(apply(&git,repo,path,&review.review_token).unwrap_err().contains("patch changed"));fs::write(source.path(),&patch.text).unwrap();
        fs::write(repo.join("other.txt"),"original\n").unwrap();run(&git,repo,&["add","other.txt"]).unwrap();run(&git,repo,&["commit","-qm","Other"]).unwrap();fs::write(repo.join("other.txt"),"keep local\n").unwrap();let review=preview(&git,repo,path).unwrap();apply(&git,repo,path,&review.review_token).unwrap();assert_eq!(fs::read_to_string(repo.join("other.txt")).unwrap(),"keep local\n");assert_eq!(text(&git,repo,&["show","stash@{0}:other.txt"]).unwrap(),"keep local");
    }
    #[test]fn validates_both_rename_paths_and_prevents_traversal_git_and_symlink_targets(){
        let(root,git)=fixture();let repo=root.path();run(&git,repo,&["mv","file.txt","renamed.txt"]).unwrap();let token=git_tools::inspect(&git,repo).unwrap().review_token;let exported=export(&git,repo,&["renamed.txt".into()],true,&token).unwrap();run(&git,repo,&["reset","--hard","-q","HEAD"]).unwrap();let source=save_patch(&exported.text);let review=preview(&git,repo,source.path().to_str().unwrap()).unwrap();assert!(review.files.contains(&"file.txt".into()));assert!(review.files.contains(&"renamed.txt".into()));
        for file in ["../escape.txt",".git/config","folder/../../escape.txt","/absolute"]{assert!(validate_path(repo,file).is_err());}
        let unsafe_patch=save_patch("diff --git a/.git/config b/.git/config\n--- a/.git/config\n+++ b/.git/config\n@@ -0,0 +1 @@\n+unsafe\n");assert!(preview(&git,repo,unsafe_patch.path().to_str().unwrap()).is_err());
        let symlink=save_patch("diff --git a/link b/link\nnew file mode 120000\n--- /dev/null\n+++ b/link\n@@ -0,0 +1 @@\n+/outside\n");assert!(preview(&git,repo,symlink.path().to_str().unwrap()).unwrap_err().contains("symbolic"));
    }
    #[test]fn binary_patch_round_trips_and_failed_context_does_not_mutate_files(){
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("binary.dat"),b"before\0data").unwrap();run(&git,repo,&["add","binary.dat"]).unwrap();run(&git,repo,&["commit","-qm","Binary"]).unwrap();fs::write(repo.join("binary.dat"),b"after\0data").unwrap();let token=git_tools::inspect(&git,repo).unwrap().review_token;let patch=export(&git,repo,&["binary.dat".into()],false,&token).unwrap();assert!(patch.text.contains("GIT binary patch"));run(&git,repo,&["restore","binary.dat"]).unwrap();let source=save_patch(&patch.text);let path=source.path().to_str().unwrap();let review=preview(&git,repo,path).unwrap();apply(&git,repo,path,&review.review_token).unwrap();assert_eq!(fs::read(repo.join("binary.dat")).unwrap(),b"after\0data");let review=preview(&git,repo,path).unwrap();assert!(!review.can_apply);assert!(apply(&git,repo,path,&review.review_token).is_err());assert_eq!(fs::read(repo.join("binary.dat")).unwrap(),b"after\0data");
    }
}
