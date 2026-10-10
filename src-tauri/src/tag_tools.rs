use crate::{git_tools, version_control::run};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag { pub name: String, pub object_id: String, pub commit_id: String, pub annotated: bool, pub subject: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagState { pub review_token: String, pub tags: Vec<Tag>, pub remotes: Vec<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagRemoteReview { pub review_token: String, pub remote_tip: String, pub local_tip: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagRequest {
    pub action: String, pub tag: String, pub revision: String, pub message: String,
    pub annotated: bool, pub signed: bool, pub remote: String, pub review_token: String,
    pub remote_tip: String, pub local_tip: String,
}
const CHANGED: &str = "Repository changed. Refresh and review the operation again.";
fn text(git: &Path, repo: &Path, args: &[&str]) -> Result<String, String> { Ok(String::from_utf8_lossy(&run(git,repo,args)?).trim().to_owned()) }
fn valid_tag(git: &Path, repo: &Path, tag: &str) -> Result<String, String> {
    if tag.is_empty() || tag.starts_with('-') || tag.len() > 255 { return Err("Enter a valid tag name.".into()); }
    let reference=format!("refs/tags/{tag}");run(git,repo,&["check-ref-format",&reference]).map_err(|_| "Enter a valid tag name.")?;Ok(reference)
}
pub fn inspect(git: &Path, repo: &Path) -> Result<TagState, String> {
    let state=git_tools::inspect(git,repo).map_err(|_| "Could not read tags.")?;
    let bytes=run(git,repo,&["for-each-ref","--sort=-creatordate","--format=%(refname:strip=2)%00%(objectname)%00%(*objectname)%00%(objecttype)%00%(subject)","refs/tags"]).map_err(|_| "Could not read tags.")?;
    let tags=String::from_utf8_lossy(&bytes).lines().filter_map(|line| {
        let p:Vec<_>=line.splitn(5,'\0').collect();if p.len()!=5 {return None;}
        Some(Tag {name:p[0].into(),object_id:p[1].into(),commit_id:if p[2].is_empty(){p[1]}else{p[2]}.into(),annotated:p[3]=="tag",subject:p[4].into()})
    }).collect();
    Ok(TagState {review_token:state.review_token,tags,remotes:state.remotes})
}
fn remote_url(git: &Path, repo: &Path, remote: &str) -> Result<String,String> {
    let state=git_tools::inspect(git,repo).map_err(|_| "Could not read tags.")?;
    if !state.remotes.iter().any(|r| r==remote) {return Err("Select a configured remote.".into());}
    let urls=text(git,repo,&["remote","get-url","--push","--all",remote]).map_err(|_| "Could not read the tag destination.")?;
    let list:Vec<_>=urls.lines().collect();if list.len()!=1 {return Err("This remote has multiple push destinations. Manage its tags using Git.".into());}Ok(list[0].into())
}
fn remote_tip(git: &Path, repo: &Path, url: &str, reference: &str) -> Result<String,String> {
    let bytes=run(git,repo,&["ls-remote","--refs","--",url,reference]).map_err(|_| "Could not check remote tags. Check authentication, permissions, and network, then retry.")?;
    let output=String::from_utf8_lossy(&bytes);
    for line in output.lines() {if let Some((hash,name))=line.split_once('\t') {if name==reference && matches!(hash.len(),40|64) && hash.bytes().all(|c|c.is_ascii_hexdigit()) {return Ok(hash.into());}}}
    Ok(String::new())
}
pub fn review_remote(git: &Path, repo: &Path, action: &str, tag: &str, remote: &str) -> Result<TagRemoteReview,String> {
    if !["push","delete-remote"].contains(&action) {return Err("Unsupported tag operation.".into());}
    let reference=valid_tag(git,repo,tag)?;
    let state=inspect(git,repo)?;let local=state.tags.iter().find(|t|t.name==tag).ok_or("Select a local tag.")?;
    let destination=remote_url(git,repo,remote)?;let tip=remote_tip(git,repo,&destination,&reference)?;
    if action=="delete-remote" && tip.is_empty() {return Err("This tag does not exist on the selected remote.".into());}
    if action=="push" && !tip.is_empty() {return Err(if tip==local.object_id {"This remote already has the same tag."}else{"This remote already has a different tag. GitOrbit will not replace it."}.into());}
    if git_tools::inspect(git,repo).map_err(|_| "Could not read tags.")?.review_token!=state.review_token {return Err(CHANGED.into());}
    Ok(TagRemoteReview {review_token:state.review_token,remote_tip:tip,local_tip:local.object_id.clone()})
}
pub fn execute(git: &Path, repo: &Path, request: &TagRequest) -> Result<String,String> {
    let state=git_tools::inspect(git,repo).map_err(|_| "Could not read tags.")?;
    if state.review_token!=request.review_token {return Err(CHANGED.into());}
    if state.operation.is_some() {return Err("Finish or abort the current Git operation first.".into());}
    let reference=valid_tag(git,repo,&request.tag)?;
    match request.action.as_str() {
        "create" => {
            if run(git,repo,&["show-ref","--verify","--quiet",&reference]).is_ok() {return Err("A tag with this name already exists.".into());}
            if request.revision.is_empty() || request.revision.starts_with('-') || request.revision.len()>512 {return Err("Select a revision.".into());}
            let hash=text(git,repo,&["rev-parse","--verify","--end-of-options",&format!("{}^{{commit}}",request.revision)]).map_err(|_| "Select a valid commit revision.")?;
            if (request.annotated || request.signed) && (request.message.trim().is_empty() || request.message.len()>65536) {return Err("Enter an annotation message for this tag.".into());}
            let mut args=vec!["-c","tag.gpgSign=false","tag"];
            if request.signed {args.push("-s");}else if request.annotated {args.push("-a");}
            if request.annotated || request.signed {args.extend(["-m",&request.message]);}
            args.extend(["--",&request.tag,&hash]);
            run(git,repo,&args).map_err(|_| if request.signed {"Could not sign the tag. Configure your signing key and signing agent, then retry."}else{"Could not create the tag. Refresh and try again."})?;
            Ok("Tag created.".into())
        }
        "push" | "delete-remote" => {
            let local=text(git,repo,&["rev-parse","--verify","--end-of-options",&reference]).map_err(|_| "Select a local tag.")?;
            if local!=request.local_tip {return Err(CHANGED.into());}
            let destination=remote_url(git,repo,&request.remote)?;
            let tip=remote_tip(git,repo,&destination,&reference)?;
            if tip!=request.remote_tip {return Err("The remote tag changed. Check its current state and review again.".into());}
            if request.action=="push" && !tip.is_empty() {return Err("This remote already has a tag with this name. GitOrbit will not replace it.".into());}
            if request.action=="delete-remote" && tip.is_empty() {return Err("This tag does not exist on the selected remote.".into());}
            if git_tools::inspect(git,repo).map_err(|_| "Could not read tags.")?.review_token!=request.review_token {return Err(CHANGED.into());}
            let lease=format!("--force-with-lease={reference}:{tip}");
            let refspec=if request.action=="push" {format!("{local}:{reference}")}else{format!(":{reference}")};
            run(git,repo,&["push",&lease,"--",&destination,&refspec]).map_err(|_| "The tag operation failed. Check remote state, permissions, authentication, and network, then review again.")?;
            Ok(if request.action=="push" {"Tag pushed."}else{"Remote tag deleted. The local tag is preserved."}.into())
        }
        _ => Err("Unsupported tag operation.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture()->(tempfile::TempDir,std::path::PathBuf,std::path::PathBuf,std::path::PathBuf){
        let root=tempfile::tempdir().unwrap();let (g,_)=crate::git::find_git().unwrap();let local=root.path().join("local");let remote=root.path().join("remote.git");std::fs::create_dir(&local).unwrap();
        run(&g,&local,&["init","-q","-b","main"]).unwrap();run(&g,root.path(),&["init","--bare","-q",remote.to_str().unwrap()]).unwrap();
        for a in [["config","user.name","Test"],["config","user.email","test@example.invalid"],["config","commit.gpgsign","false"]] {run(&g,&local,&a).unwrap();}
        run(&g,&local,&["commit","--allow-empty","-qm","Initial"]).unwrap();run(&g,&local,&["remote","add","origin",remote.to_str().unwrap()]).unwrap();(root,g,local,remote)
    }
    fn create(g:&Path,p:&Path,tag:&str,annotated:bool)->TagRequest{TagRequest {action:"create".into(),tag:tag.into(),revision:"HEAD".into(),message:if annotated{"Release notes"}else{""}.into(),annotated,signed:false,remote:String::new(),review_token:inspect(g,p).unwrap().review_token,remote_tip:String::new(),local_tip:String::new()}}
    fn remote_request(g:&Path,p:&Path,action:&str,tag:&str)->TagRequest{let r=review_remote(g,p,action,tag,"origin").unwrap();TagRequest{action:action.into(),tag:tag.into(),revision:String::new(),message:String::new(),annotated:false,signed:false,remote:"origin".into(),review_token:r.review_token,remote_tip:r.remote_tip,local_tip:r.local_tip}}
    #[test]
    fn lightweight_annotated_and_explicit_unsigned_ignore_implicit_signing(){let (_r,g,p,_remote)=fixture();run(&g,&p,&["config","tag.gpgSign","true"]).unwrap();execute(&g,&p,&create(&g,&p,"light",false)).unwrap();execute(&g,&p,&create(&g,&p,"annotated",true)).unwrap();let state=inspect(&g,&p).unwrap();assert!(!state.tags.iter().find(|t|t.name=="light").unwrap().annotated);assert!(state.tags.iter().find(|t|t.name=="annotated").unwrap().annotated);assert!(execute(&g,&p,&create(&g,&p,"light",false)).is_err());}
    #[test]
    fn push_and_delete_exact_annotated_tag_preserves_local(){let (_r,g,p,remote)=fixture();execute(&g,&p,&create(&g,&p,"v1",true)).unwrap();let push=remote_request(&g,&p,"push","v1");execute(&g,&p,&push).unwrap();assert!(review_remote(&g,&p,"push","v1","origin").is_err());let delete=remote_request(&g,&p,"delete-remote","v1");execute(&g,&p,&delete).unwrap();assert!(run(&g,&remote,&["show-ref","--verify","refs/tags/v1"]).is_err());assert!(run(&g,&p,&["show-ref","--verify","refs/tags/v1"]).is_ok());}
    #[test]
    fn refuses_remote_change_after_review_and_never_replaces_tag(){let (_r,g,p,remote)=fixture();execute(&g,&p,&create(&g,&p,"v1",false)).unwrap();run(&g,&p,&["push","origin","HEAD:refs/heads/main"]).unwrap();let request=remote_request(&g,&p,"push","v1");run(&g,&remote,&["update-ref","refs/tags/v1","refs/heads/main"]).unwrap();assert!(execute(&g,&p,&request).unwrap_err().contains("remote tag changed"));run(&g,&p,&["commit","--allow-empty","-qm","Another"]).unwrap();run(&g,&p,&["push","origin","HEAD:refs/heads/main"]).unwrap();let delete=remote_request(&g,&p,"delete-remote","v1");run(&g,&remote,&["update-ref","refs/tags/v1","refs/heads/main"]).unwrap();assert!(execute(&g,&p,&delete).unwrap_err().contains("remote tag changed"));assert!(run(&g,&remote,&["show-ref","--verify","refs/tags/v1"]).is_ok());}
    #[test]
    fn refuses_stale_local_tag_review_invalid_name_and_missing_annotation(){let (_r,g,p,_remote)=fixture();let old=create(&g,&p,"v1",false);std::fs::write(p.join("dirty.txt"),"changed").unwrap();assert!(execute(&g,&p,&old).unwrap_err().contains("Repository changed"));let mut bad=create(&g,&p,"bad..name",false);assert!(execute(&g,&p,&bad).is_err());bad=create(&g,&p,"v1",true);bad.message.clear();assert!(execute(&g,&p,&bad).is_err());}
}
