use crate::version_control::run;
use serde::Serialize;
use std::path::{Component, Path};
const MAX_ENTRIES:usize=5000;
const MAX_BLOB:usize=2*1024*1024;
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct RevisionEntry {pub name:String,pub path:String,pub kind:String,pub hash:String,pub size:Option<usize>}
#[derive(Debug,Serialize)]
pub struct RevisionTree {pub revision:String,pub directory:String,pub entries:Vec<RevisionEntry>,pub truncated:bool}
#[derive(Debug,Serialize)]
pub struct RevisionBlob {pub revision:String,pub path:String,pub text:Option<String>,pub binary:Option<bool>,pub truncated:bool,pub size:usize,pub kind:String,pub preview:Option<crate::file_preview::FilePreview>}
fn valid_path(path:&str,allow_root:bool)->Result<(),String>{
    if allow_root&&path.is_empty(){return Ok(());}
    if path.is_empty()||path.len()>4096||path.contains(['\0','\\',':'])||path.starts_with('/')
        ||!Path::new(path).components().all(|part|matches!(part,Component::Normal(_)))
        ||path.split('/').any(|part|part.is_empty()||part=="."||part==".."||part.eq_ignore_ascii_case(".git")){return Err("Choose a repository-relative revision path.".into());}Ok(())
}
fn valid_revision(git:&Path,repo:&Path,revision:&str)->Result<(),String>{
    if !matches!(revision.len(),40|64)||!revision.bytes().all(|b|b.is_ascii_hexdigit()){return Err("Choose a commit from the history to browse.".into());}
    if run(git,repo,&["cat-file","-t",revision])?!=b"commit\n"{return Err("Choose a commit from the history to browse.".into());}Ok(())
}
fn parse_entries(bytes:&[u8],directory:&str)->Result<Vec<RevisionEntry>,String>{
    bytes.split(|b|*b==0).filter(|entry|!entry.is_empty()).map(|entry|{
        let tab=entry.iter().position(|b|*b==b'\t').ok_or("Git returned an incomplete revision tree.")?;
        let metadata=std::str::from_utf8(&entry[..tab]).map_err(|_|"Git returned invalid revision metadata.")?;
        let parts:Vec<_>=metadata.split_whitespace().collect();if parts.len()!=4{return Err("Git returned an incomplete revision tree.".into());}
        let name=String::from_utf8(entry[tab+1..].to_vec()).map_err(|_|"Revision filenames must be valid UTF-8.")?;
        let kind=match parts[0]{"040000"=>"directory","100644"|"100755"=>"file","120000"=>"symlink","160000"=>"submodule",_=>return Err("This revision contains an unsupported file mode.".into())};
        let size=if parts[3]=="-"{None}else{Some(parts[3].parse().map_err(|_|"Git returned an invalid revision file size.")?)};
        let path=if directory.is_empty(){name.clone()}else{format!("{directory}/{name}")};
        Ok(RevisionEntry{name,path,kind:kind.into(),hash:parts[2].into(),size})
    }).collect()
}
pub fn read(git:&Path,repo:&Path,revision:&str,directory:&str)->Result<RevisionTree,String>{
    valid_revision(git,repo,revision)?;valid_path(directory,true)?;
    let tree=if directory.is_empty(){revision.to_owned()}else{format!("{revision}:{directory}")};
    if !directory.is_empty()&&run(git,repo,&["cat-file","-t",&tree])?!=b"tree\n"{return Err("Choose a directory from the selected revision.".into());}
    let output=run(git,repo,&["ls-tree","-l","-z",&tree])?;
    let mut entries=parse_entries(&output,directory)?;entries.sort_by(|a,b|{
        let directory_a=a.kind=="directory";let directory_b=b.kind=="directory";
        directory_b.cmp(&directory_a).then_with(||a.name.cmp(&b.name))
    });let truncated=entries.len()>MAX_ENTRIES;entries.truncate(MAX_ENTRIES);
    Ok(RevisionTree{revision:revision.into(),directory:directory.into(),entries,truncated})
}
pub fn blob(git:&Path,repo:&Path,revision:&str,file:&str)->Result<RevisionBlob,String>{
    valid_revision(git,repo,revision)?;valid_path(file,false)?;
    let bytes=run(git,repo,&["--literal-pathspecs","ls-tree","--full-tree","-l","-z",revision,"--",file])?;
    let entries=parse_entries(&bytes,"")?;let entry=entries.into_iter().find(|entry|entry.path==file).ok_or("This file is not present in the selected revision.")?;
    if entry.kind=="directory"||entry.kind=="submodule"{return Err("Choose a file from the selected revision.".into());}
    let size=entry.size.ok_or("Git returned an invalid revision file size.")?;
    if entry.kind=="file" && crate::file_preview::supported(file) {
        let preview=crate::file_preview::read(git,repo,crate::file_preview::Source::Revision(revision,file))?;
        return Ok(RevisionBlob{revision:revision.into(),path:file.into(),text:None,binary:Some(true),truncated:false,size,kind:entry.kind,preview});
    }
    if size>MAX_BLOB{return Ok(RevisionBlob{revision:revision.into(),path:file.into(),text:None,binary:None,truncated:true,size,kind:entry.kind,preview:None});}
    // Read the immutable blob object; never open the working-tree path or follow links.
    let content=run(git,repo,&["cat-file","blob",&entry.hash])?;
    let binary=content.contains(&0)||std::str::from_utf8(&content).is_err();
    let preview=if binary && entry.kind=="file" {crate::file_preview::read(git,repo,crate::file_preview::Source::Revision(revision,file))?}else{None};
    Ok(RevisionBlob{revision:revision.into(),path:file.into(),text:if binary{None}else{Some(String::from_utf8(content).map_err(|_|"Could not decode revision text.")?)},binary:Some(binary),truncated:false,size,kind:entry.kind,preview})
}

#[cfg(test)]mod tests{
    use super::*;use crate::git::find_git;use std::fs;
    fn fixture()->(tempfile::TempDir,std::path::PathBuf){let root=tempfile::tempdir().unwrap();let(git,_)=find_git().expect("Git required");for args in [&["init","-q","-b","main"][..],&["config","user.name","Demo"],&["config","user.email","demo@example.test"],&["config","commit.gpgsign","false"],&["config","core.autocrlf","false"]]{run(&git,root.path(),args).unwrap();}(root,git)}
    fn commit(git:&Path,repo:&Path)->String{run(git,repo,&["add","--all"]).unwrap();run(git,repo,&["commit","-qm","Snapshot"]).unwrap();String::from_utf8_lossy(&run(git,repo,&["rev-parse","HEAD"]).unwrap()).trim().to_owned()}
    #[test]fn browses_lazy_folders_and_reads_snapshot_independent_of_head_index_and_working_tree(){
        let(root,git)=fixture();let repo=root.path();fs::create_dir(repo.join("src")).unwrap();fs::write(repo.join("src/[literal].txt"),"snapshot\n").unwrap();fs::write(repo.join("readme.md"),"Readme\n").unwrap();let revision=commit(&git,repo);
        fs::write(repo.join("src/[literal].txt"),"staged\n").unwrap();run(&git,repo,&["add","--all"]).unwrap();fs::write(repo.join("src/[literal].txt"),"working\n").unwrap();
        let tree=read(&git,repo,&revision,"").unwrap();assert_eq!(tree.entries.len(),2);assert_eq!(tree.entries[0].kind,"directory");assert_eq!(tree.entries[0].name,"src");
        let nested=read(&git,repo,&revision,"src").unwrap();assert_eq!(nested.entries[0].path,"src/[literal].txt");assert_eq!(nested.entries[0].size,Some(9));
        assert_eq!(blob(&git,repo,&revision,"src/[literal].txt").unwrap().text.as_deref(),Some("snapshot\n"));assert_eq!(fs::read_to_string(repo.join("src/[literal].txt")).unwrap(),"working\n");
        assert!(String::from_utf8_lossy(&run(&git,repo,&["show",":src/[literal].txt"]).unwrap()).contains("staged"));
    }
    #[test]fn marks_binary_empty_and_oversized_blobs_without_decoding_or_truncating_them_as_text(){
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("binary.dat"),b"a\0b").unwrap();fs::write(repo.join("empty.txt"),"").unwrap();fs::write(repo.join("large.txt"),vec![b'x';MAX_BLOB+1]).unwrap();let revision=commit(&git,repo);
        let binary=blob(&git,repo,&revision,"binary.dat").unwrap();assert_eq!(binary.binary,Some(true));assert!(binary.text.is_none());assert!(!binary.truncated);
        let empty=blob(&git,repo,&revision,"empty.txt").unwrap();assert_eq!(empty.text.as_deref(),Some(""));assert_eq!(empty.size,0);
        let large=blob(&git,repo,&revision,"large.txt").unwrap();assert!(large.truncated);assert_eq!(large.binary,None);assert!(large.text.is_none());
    }
    #[test]fn validates_revision_object_and_literal_directory_paths(){
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("file.txt"),"safe\n").unwrap();let revision=commit(&git,repo);
        for value in ["HEAD","--help","main","a..b"]{assert!(read(&git,repo,value,"").is_err());}
        let tree_hash=String::from_utf8_lossy(&run(&git,repo,&["rev-parse","HEAD^{tree}"]).unwrap()).trim().to_owned();assert!(read(&git,repo,&tree_hash,"").is_err());
        for path in ["../outside","/outside",":(glob)*","C:/outside",".git/config","a/../file.txt","a\\file.txt"]{assert!(read(&git,repo,&revision,path).is_err());assert!(blob(&git,repo,&revision,path).is_err());}
        assert!(read(&git,repo,&revision,"file.txt").is_err());assert!(blob(&git,repo,&revision,"missing.txt").is_err());
    }
    #[test]fn symlinks_and_submodules_are_metadata_only_and_never_open_working_targets(){
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("file.txt"),"base\n").unwrap();let base=commit(&git,repo);let target=root.path().join("target-value");fs::write(&target,"/outside/private-file").unwrap();
        let object=String::from_utf8_lossy(&run(&git,repo,&["hash-object","-w",target.to_str().unwrap()]).unwrap()).trim().to_owned();fs::remove_file(target).unwrap();
        run(&git,repo,&["update-index","--add","--cacheinfo","120000",&object,"link"]).unwrap();run(&git,repo,&["update-index","--add","--cacheinfo","160000",&base,"module"]).unwrap();run(&git,repo,&["commit","-qm","Link and module"]).unwrap();let revision=String::from_utf8_lossy(&run(&git,repo,&["rev-parse","HEAD"]).unwrap()).trim().to_owned();
        let tree=read(&git,repo,&revision,"").unwrap();assert!(tree.entries.iter().any(|entry|entry.path=="module"&&entry.kind=="submodule"));let link=blob(&git,repo,&revision,"link").unwrap();assert_eq!(link.kind,"symlink");assert_eq!(link.text.as_deref(),Some("/outside/private-file"));assert!(blob(&git,repo,&revision,"module").is_err());assert!(read(&git,repo,&revision,"module").is_err());
    }
}
