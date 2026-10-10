use crate::{git, git_tools, remotes, version_control::run};
use command_group::CommandGroup;
use serde::Serialize;
use std::{collections::hash_map::DefaultHasher, fs, hash::{Hash, Hasher}, path::{Component, Path, PathBuf}, process::Stdio, thread, time::{Duration, Instant}};

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Submodule { pub name:String, pub path:String, pub url:String, pub status:String, pub expected_head:String, pub head:String, pub dirty:bool, pub blocked_reason:Option<String> }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct SubmodulesState { pub review_token:String, pub modules:Vec<Submodule>, pub warnings:Vec<String> }
fn location(root:&Path,path:&str)->Result<PathBuf,String>{
    if path.is_empty() || path.chars().any(char::is_control) || path.contains(['\\',':']) || Path::new(path).components().any(|c| !matches!(c,Component::Normal(_))) || path.split('/').any(|p|p.is_empty()||p==".git"||p=="."||p=="..") {return Err("This submodule path is unsafe. Configure it using Git before updating.".into());}
    let root=fs::canonicalize(root).map_err(|_|"Could not read submodules.")?;let mut target=root.clone();
    for part in path.split('/') {target.push(part);match fs::symlink_metadata(&target){
        Ok(meta)=>{
            #[cfg(windows)] let reparse={use std::os::windows::fs::MetadataExt;meta.file_attributes()&0x400!=0};
            #[cfg(not(windows))] let reparse=false;
            if meta.file_type().is_symlink()||reparse||!meta.is_dir(){return Err("This submodule path is unsafe. Configure it using Git before updating.".into());}
            let actual=fs::canonicalize(&target).map_err(|_|"Could not read submodules.")?;if !actual.starts_with(&root){return Err("This submodule path is unsafe. Configure it using Git before updating.".into());}
        }
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},
        Err(_)=>return Err("Could not read submodules.".into()),
    }}Ok(target)
}
fn safe_url(value:&str)->(String,bool){
    if value.contains("://"){if let Ok(mut u)=url::Url::parse(value){let secret=u.password().is_some()||(u.scheme()!="ssh"&&!u.username().is_empty())||u.query().is_some()||u.fragment().is_some();if secret{let _=u.set_username("");let _=u.set_password(None);u.set_query(None);u.set_fragment(None);}return(u.to_string(),secret);}return("[redacted URL]".into(),true);}
    if remotes::validate_url(value).is_err() {return("[redacted URL]".into(),true);} (value.into(),false)
}
fn safe_name(name:&str)->bool{!name.is_empty()&&!name.chars().any(char::is_control)&&!name.contains(['\\',':'])&&Path::new(name).components().all(|c|matches!(c,Component::Normal(_)))&&name.split('/').all(|p|!p.is_empty()&&p!=".git"&&p!="."&&p!="..")}
fn configured(git:&Path,repo:&Path,key:&str)->Option<String>{run(git,repo,&["config","--get",key]).ok().map(|b|String::from_utf8_lossy(&b).trim_end_matches(['\r','\n']).to_owned())}
pub fn inspect(git:&Path,repo:&Path)->Result<SubmodulesState,String>{
    let base=git_tools::inspect(git,repo).map_err(|_|"Could not read submodules.")?;let mut identity=DefaultHasher::new();base.review_token.hash(&mut identity);
    let index=run(git,repo,&["ls-files","--stage","-z"]).map_err(|_|"Could not read submodules.")?;index.hash(&mut identity);
    let modules_path=repo.join(".gitmodules");
    if modules_path.is_symlink(){return Err("The submodule configuration is a symbolic link. Inspect it using Git.".into());}
    let contents=fs::read(&modules_path).unwrap_or_default();contents.hash(&mut identity);
    let definitions=if contents.is_empty(){Vec::new()}else{run(git,repo,&["config","--null","--file",".gitmodules","--get-regexp","^submodule\\..*\\.path$"]).map_err(|_|"Could not parse .gitmodules. Check its configuration using Git.")?};
    let mut modules=Vec::new();let mut warnings=Vec::new();
    for entry in definitions.split(|b|*b==0).filter(|v|!v.is_empty()){
        let text=String::from_utf8_lossy(entry);let Some((key,path))=text.split_once('\n')else{warnings.push("A submodule entry could not be read. Inspect .gitmodules using Git.".into());continue;};
        let Some(name)=key.strip_prefix("submodule.").and_then(|v|v.strip_suffix(".path"))else{continue;};
        let mut expected=String::new();let mut conflict=false;
        for record in index.split(|b|*b==0){if let Some(tab)=record.iter().position(|b|*b==b'\t'){let fields=String::from_utf8_lossy(&record[..tab]);let f:Vec<_>=fields.split_whitespace().collect();if f.len()==3&&f[0]=="160000"&&record[tab+1..]==*path.as_bytes(){if f[2]=="0"||expected.is_empty(){expected=f[1].into();}if f[2]!="0"{conflict=true;}}}}
        if expected.is_empty(){warnings.push("A configured submodule has no gitlink in the index. Inspect .gitmodules using Git.".into());continue;}
        let url_key=format!("submodule.{name}.url");let raw=configured(git,repo,&url_key).unwrap_or_else(||run(git,repo,&["config","--file",".gitmodules","--get",&url_key]).map(|b|String::from_utf8_lossy(&b).trim_end_matches(['\r','\n']).to_owned()).unwrap_or_default());raw.hash(&mut identity);
        let (display,credentials)=safe_url(&raw);let mut blocked=if !safe_name(name){Some("This submodule path is unsafe. Configure it using Git before updating.".into())}else if credentials{Some("Submodule credentials are hidden. Configure a clean URL using Git before updating.".into())}else if remotes::validate_url(&raw).is_err(){Some("Configure an absolute SSH, HTTPS, or local submodule URL using Git before updating.".into())}else{None};
        let mut head=String::new();let mut dirty=false;let mut status=if conflict{"conflict"}else{"uninitialized"}.to_owned();
        match location(repo,path){
            Err(e)=>{blocked=Some(e);status="blocked".into();}
            Ok(target)=>{if target.is_dir(){
                let top=run(git,&target,&["rev-parse","--show-toplevel"]).ok().and_then(|b|fs::canonicalize(String::from_utf8_lossy(&b).trim()).ok());
                if top.as_deref()==fs::canonicalize(&target).ok().as_deref(){
                    match (run(git,&target,&["rev-parse","--verify","HEAD"]),run(git,&target,&["status","--porcelain=v2","-z","--untracked-files=all","--ignore-submodules=none"])){
                        (Ok(h),Ok(s))=>{h.hash(&mut identity);s.hash(&mut identity);head=String::from_utf8_lossy(&h).trim().into();dirty=!s.is_empty();let local_conflict=s.split(|b|*b==0).any(|r|r.starts_with(b"u "));status=if conflict||local_conflict{"conflict"}else if head==expected{"ready"}else{"diverged"}.into();if dirty{blocked=Some("Commit or stash changes inside this submodule before updating. Local files are preserved.".into());}}
                        _=>{blocked=Some("Could not inspect this submodule. Check it using Git before updating.".into());status="blocked".into();}
                    }
                }else if fs::read_dir(&target).map(|mut e|e.next().is_some()).unwrap_or(true){blocked=Some("The submodule folder contains files but is not initialized. Inspect it using Git before updating.".into());status="blocked".into();}
            }}
        }
        if conflict{blocked=Some("Resolve the submodule gitlink conflict before updating.".into());}
        (&head,&status,dirty,&blocked).hash(&mut identity);
        modules.push(Submodule{name:name.into(),path:path.into(),url:display,status,expected_head:expected,head,dirty,blocked_reason:blocked});
    }
    Ok(SubmodulesState{review_token:format!("{:016x}",identity.finish()),modules,warnings})
}
pub fn update(git:&Path,repo:&Path,path:&str,review_token:&str)->Result<String,String>{
    update_configured(git,repo,path,review_token,|_|{})
}
fn update_configured(git:&Path,repo:&Path,path:&str,review_token:&str,configure:impl FnOnce(&mut std::process::Command))->Result<String,String>{
    let current=inspect(git,repo)?;if current.review_token!=review_token{return Err("Repository changed. Refresh and review the operation again.".into());}
    let module=current.modules.iter().find(|m|m.path==path).ok_or("Choose a submodule from this repository.")?;
    if let Some(reason)=&module.blocked_reason{return Err(reason.clone());}
    if git_tools::inspect(git,repo).map_err(|_|"Could not read submodules.")?.operation.is_some(){return Err("Finish or abort the current Git operation first.".into());}
    let target=location(repo,path)?;
    if !module.head.is_empty()&&module.head!=module.expected_head{
        let reference=format!("refs/gitorbit/recovery/{}-submodule-{}",git::now_ms(),&module.head[..8]);
        run(git,&target,&["update-ref",&reference,&module.head,""]).map_err(|_|"Could not save a submodule recovery reference. Its checked-out commit was not changed.")?;
    }
    let mut cmd=git::git_command(git,repo);cmd.args(["-c","submodule.recurse=false","-c","fetch.recurseSubmodules=false","submodule","update","--init","--checkout","--",path]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());configure(&mut cmd);
    let mut child=cmd.group_spawn().map_err(|_|"Could not start submodule update.")?;let start=Instant::now();
    loop{match child.try_wait(){Ok(Some(status))=>return if status.success(){Ok("Submodule updated to the commit recorded by the parent repository.".into())}else{Err("Submodule update failed. Check credentials, network, and submodule configuration using Git. Existing files were not forcefully discarded.".into())},Ok(None)if start.elapsed()<Duration::from_secs(120)=>thread::sleep(Duration::from_millis(50)),_=>{let _=child.kill();let _=child.wait();return Err("Submodule update timed out. Inspect its state using Git before retrying.".into());}}}
}

#[cfg(test)]
mod tests{
    use super::*;
    fn fixture()->(tempfile::TempDir,PathBuf,PathBuf){let root=tempfile::tempdir().unwrap();let(g,_)=git::find_git().unwrap();let parent=root.path().join("parent");fs::create_dir(&parent).unwrap();run(&g,&parent,&["init","-q","-b","main"]).unwrap();for a in [["config","user.name","Test"],["config","user.email","test@example.invalid"],["config","commit.gpgsign","false"]]{run(&g,&parent,&a).unwrap();}run(&g,&parent,&["commit","--allow-empty","-qm","Initial"]).unwrap();(root,g,parent)}
    fn module(g:&Path,p:&Path)->String{let child=p.join("child");fs::create_dir(&child).unwrap();run(g,&child,&["init","-q","-b","main"]).unwrap();for a in [["config","user.name","Test"],["config","user.email","test@example.invalid"],["config","commit.gpgsign","false"]]{run(g,&child,&a).unwrap();}run(g,&child,&["commit","--allow-empty","-qm","Child"]).unwrap();let head=String::from_utf8(run(g,&child,&["rev-parse","HEAD"]).unwrap()).unwrap().trim().to_owned();fs::write(p.join(".gitmodules"),"[submodule \"child\"]\n path = child\n url = https://example.invalid/child.git\n").unwrap();run(g,p,&["add",".gitmodules"]).unwrap();run(g,p,&["update-index","--add","--cacheinfo",&format!("160000,{head},child")]).unwrap();head}
    #[test]fn inventory_detects_clean_dirty_and_refuses_dirty_update(){let(_r,g,p)=fixture();let head=module(&g,&p);let state=inspect(&g,&p).unwrap();assert_eq!(state.modules[0].status,"ready");assert_eq!(state.modules[0].head,head);fs::write(p.join("child/keep.txt"),"local work").unwrap();let dirty=inspect(&g,&p).unwrap();assert!(dirty.modules[0].dirty);assert!(update(&g,&p,"child",&dirty.review_token).unwrap_err().contains("Commit or stash"));assert_eq!(fs::read_to_string(p.join("child/keep.txt")).unwrap(),"local work");assert_ne!(state.review_token,dirty.review_token);}
    #[test]fn reviewed_clean_update_does_not_commit_or_push(){let(_r,g,p)=fixture();module(&g,&p);let head=run(&g,&p,&["rev-parse","HEAD"]).unwrap();let s=inspect(&g,&p).unwrap();update(&g,&p,"child",&s.review_token).unwrap();assert_eq!(head,run(&g,&p,&["rev-parse","HEAD"]).unwrap());}
    #[test]fn url_credentials_are_hidden_and_unsafe_paths_blocked(){let(_r,g,p)=fixture();module(&g,&p);run(&g,&p,&["config","submodule.child.url","https://user:fixture-secret@example.invalid/child.git?token=secret"]).unwrap();let s=inspect(&g,&p).unwrap();assert!(s.modules[0].blocked_reason.is_some());assert!(!serde_json::to_string(&s).unwrap().contains("fixture-secret"));assert!(location(&p,"../outside").is_err());assert!(location(&p,"child/../../outside").is_err());assert!(location(&p,".git/modules").is_err());assert!(!safe_name("../escape"));assert!(!safe_name("child\nurl"));assert!(safe_name("group/child"));assert_eq!(safe_url("opaque-fixture-secret").0,"[redacted URL]");assert!(update(&g,&p,"child",&s.review_token).is_err());}
    #[test]fn stale_review_refused_after_submodule_head_changes(){let(_r,g,p)=fixture();module(&g,&p);let s=inspect(&g,&p).unwrap();run(&g,&p.join("child"),&["commit","--allow-empty","-qm","Later"]).unwrap();let after=inspect(&g,&p).unwrap();assert_eq!(after.modules[0].status,"diverged");assert!(update(&g,&p,"child",&s.review_token).unwrap_err().contains("Repository changed"));}
    #[test]fn initializes_from_local_origin_then_updates_with_durable_child_recovery(){
        let(root,g,p)=fixture();let source=root.path().join("source");fs::create_dir(&source).unwrap();run(&g,&source,&["init","-q","-b","main"]).unwrap();
        for args in [["config","user.name","Test"],["config","user.email","test@example.invalid"],["config","commit.gpgsign","false"]]{run(&g,&source,&args).unwrap();}
        fs::write(source.join("tracked.txt"),"first").unwrap();run(&g,&source,&["add","tracked.txt"]).unwrap();run(&g,&source,&["commit","-qm","First"]).unwrap();
        let first=String::from_utf8(run(&g,&source,&["rev-parse","HEAD"]).unwrap()).unwrap().trim().to_owned();
        let url=source.to_string_lossy().replace('\\',"/");fs::write(p.join(".gitmodules"),format!("[submodule \"child\"]\n path = child\n url = {url}\n")).unwrap();run(&g,&p,&["add",".gitmodules"]).unwrap();run(&g,&p,&["update-index","--add","--cacheinfo",&format!("160000,{first},child")]).unwrap();
        // A per-command fixture global config is inherited by Git's clone subprocess.
        // No process environment, user config, or production protocol policy is changed.
        let config=root.path().join("fixture.gitconfig");fs::write(&config,"[protocol \"file\"]\n allow = always\n").unwrap();
        let before=inspect(&g,&p).unwrap();assert_eq!(before.modules[0].status,"uninitialized");
        update_configured(&g,&p,"child",&before.review_token,|cmd|{cmd.env("GIT_CONFIG_GLOBAL",&config);}).unwrap();
        assert_eq!(fs::read_to_string(p.join("child/tracked.txt")).unwrap(),"first");assert_eq!(inspect(&g,&p).unwrap().modules[0].status,"ready");
        fs::write(source.join("tracked.txt"),"second").unwrap();run(&g,&source,&["commit","-am","Second"]).unwrap();let second=String::from_utf8(run(&g,&source,&["rev-parse","HEAD"]).unwrap()).unwrap().trim().to_owned();run(&g,&p,&["update-index","--cacheinfo",&format!("160000,{second},child")]).unwrap();
        let state=inspect(&g,&p).unwrap();assert_eq!(state.modules[0].status,"diverged");let parent_head=run(&g,&p,&["rev-parse","HEAD"]).unwrap();
        update_configured(&g,&p,"child",&state.review_token,|cmd|{cmd.env("GIT_CONFIG_GLOBAL",&config);}).unwrap();
        assert_eq!(inspect(&g,&p).unwrap().modules[0].head,second);assert_eq!(parent_head,run(&g,&p,&["rev-parse","HEAD"]).unwrap());
        let refs=String::from_utf8(run(&g,&p.join("child"),&["for-each-ref","--format=%(objectname)","refs/gitorbit/recovery"]).unwrap()).unwrap();assert!(refs.lines().any(|h|h==first));
    }
}
