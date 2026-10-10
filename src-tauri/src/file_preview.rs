use crate::version_control::run;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{fs, io::Read, path::{Component, Path}};

const LIMIT: u64 = 16 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    pub path: String,
    pub kind: String,
    pub mime: String,
    pub size: u64,
    pub data_url: Option<String>,
    pub unavailable: Option<String>,
}
#[derive(Debug, Serialize)]
pub struct MediaDiff { pub before: Option<FilePreview>, pub after: Option<FilePreview> }

pub enum Source<'a> { Working(&'a str), Index(&'a str), Revision(&'a str, &'a str), Empty }

pub fn supported(path: &str) -> bool { format(path).0 != "binary" }
fn format(path: &str) -> (&'static str, &'static str) {
    match path.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "png" => ("image", "image/png"), "jpg" | "jpeg" | "jfif" => ("image", "image/jpeg"),
        "gif" => ("image", "image/gif"), "webp" => ("image", "image/webp"),
        "svg" => ("image", "image/svg+xml"), "avif" => ("image", "image/avif"),
        "bmp" => ("image", "image/bmp"), "ico" => ("image", "image/x-icon"),
        "pdf" => ("pdf", "application/pdf"),
        "mp3" => ("audio", "audio/mpeg"), "wav" => ("audio", "audio/wav"),
        "ogg" | "oga" => ("audio", "audio/ogg"), "flac" => ("audio", "audio/flac"),
        "m4a" => ("audio", "audio/mp4"), "aac" => ("audio", "audio/aac"),
        "mp4" | "m4v" => ("video", "video/mp4"), "webm" => ("video", "video/webm"),
        "ogv" => ("video", "video/ogg"), "mov" => ("video", "video/quicktime"),
        _ => ("binary", "application/octet-stream"),
    }
}
fn valid_path(path: &str) -> Result<(), String> {
    if path.is_empty() || path.contains(['\0', '\\', ':']) || path.starts_with('/')
        || !Path::new(path).components().all(|part| matches!(part, Component::Normal(_)))
        || path.split('/').any(|part| part.is_empty() || part == "." || part == ".." || part.eq_ignore_ascii_case(".git")) {
        return Err("Choose a repository-relative file path.".into());
    }
    Ok(())
}
fn unavailable(path: &str, size: u64, reason: &str) -> FilePreview {
    let (kind, mime) = format(path);
    FilePreview {path: path.into(), kind: kind.into(), mime: mime.into(), size, data_url: None, unavailable: Some(reason.into())}
}
fn content(path: &str, size: u64, bytes: &[u8]) -> FilePreview {
    let (kind, mime) = format(path);
    FilePreview {path: path.into(), kind: kind.into(), mime: mime.into(), size,
        data_url: (kind != "binary").then(|| format!("data:{mime};base64,{}", STANDARD.encode(bytes))),
        unavailable: (kind == "binary").then(|| "No built-in preview for this file type.".into())}
}
fn working(repo: &Path, path: &str) -> Result<Option<FilePreview>, String> {
    valid_path(path)?;
    let root = fs::canonicalize(repo).map_err(|e| e.to_string())?;
    let mut full = root;
    for part in path.split('/') {
        full.push(part);
        match fs::symlink_metadata(&full) {
            Ok(meta) => {
                let mut linked = meta.file_type().is_symlink();
                #[cfg(windows)] { use std::os::windows::fs::MetadataExt; linked |= meta.file_attributes() & 0x400 != 0; }
                if linked { return Ok(Some(unavailable(path, 0, "Linked files are not followed in previews."))); }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.to_string()),
        }
    }
    if !fs::symlink_metadata(&full).map_err(|e| e.to_string())?.is_file() { return Ok(Some(unavailable(path, 0, "Only regular files can be previewed."))); }
    let file = fs::File::open(&full).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() { return Ok(Some(unavailable(path, 0, "Only regular files can be previewed."))); }
    if meta.len() > LIMIT { return Ok(Some(unavailable(path, meta.len(), "File exceeds the 16 MiB preview limit."))); }
    if !supported(path) { return Ok(Some(content(path, meta.len(), &[]))); }
    let mut bytes = Vec::new();
    file.take(LIMIT + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT { return Ok(Some(unavailable(path, bytes.len() as u64, "File exceeds the 16 MiB preview limit."))); }
    Ok(Some(content(path, bytes.len() as u64, &bytes)))
}
fn blob(git: &Path, repo: &Path, path: &str, revision: Option<&str>) -> Result<Option<FilePreview>, String> {
    valid_path(path)?;
    let bytes = if let Some(revision) = revision {
        run(git, repo, &["--literal-pathspecs", "ls-tree", "-z", revision, "--", path])?
    } else { run(git, repo, &["--literal-pathspecs", "ls-files", "--stage", "-z", "--", path])? };
    let entry = bytes.split(|b| *b == 0).find(|entry| entry.split_once_byte(b'\t').is_some_and(|(_, name)| name == path.as_bytes()));
    let Some(entry) = entry else { return Ok(None); };
    let (header, _) = entry.split_once_byte(b'\t').ok_or("Invalid Git file entry.")?;
    let fields: Vec<_> = header.split(|b| *b == b' ').collect();
    let mode = fields.first().copied().unwrap_or_default();
    if !matches!(mode, b"100644" | b"100755") { return Ok(Some(unavailable(path, 0, "Linked files are not followed in previews."))); }
    if revision.is_none() && fields.get(2).copied() != Some(b"0") { return Ok(Some(unavailable(path, 0, "Resolve the conflict before previewing the index."))); }
    let hash = String::from_utf8_lossy(fields.get(if revision.is_some() {2} else {1}).copied().unwrap_or_default());
    if !matches!(hash.len(), 40 | 64) || !hash.bytes().all(|b| b.is_ascii_hexdigit()) { return Err("Invalid Git blob id.".into()); }
    let size: u64 = String::from_utf8_lossy(&run(git, repo, &["cat-file", "-s", &hash])?).trim().parse().map_err(|_| "Invalid Git file size.")?;
    if size > LIMIT { return Ok(Some(unavailable(path, size, "File exceeds the 16 MiB preview limit."))); }
    if !supported(path) { return Ok(Some(content(path, size, &[]))); }
    let bytes = run(git, repo, &["cat-file", "blob", &hash])?;
    Ok(Some(content(path, size, &bytes)))
}
// A small helper keeps NUL-delimited Git paths literal, including tabs/newlines.
trait SplitByte { fn split_once_byte(&self, byte: u8) -> Option<(&[u8], &[u8])>; }
impl SplitByte for [u8] { fn split_once_byte(&self, byte: u8) -> Option<(&[u8], &[u8])> { self.iter().position(|b| *b == byte).map(|i| (&self[..i], &self[i+1..])) } }
pub fn read(git: &Path, repo: &Path, source: Source<'_>) -> Result<Option<FilePreview>, String> {
    match source { Source::Empty => Ok(None), Source::Working(path) => working(repo, path), Source::Index(path) => blob(git, repo, path, None), Source::Revision(rev, path) => blob(git, repo, path, Some(rev)) }
}
pub fn pair(git: &Path, repo: &Path, before: Source<'_>, after: Source<'_>) -> Result<MediaDiff, String> {
    Ok(MediaDiff {before: read(git, repo, before)?, after: read(git, repo, after)?})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{git::find_git, version_control};
    fn fixture() -> (tempfile::TempDir, std::path::PathBuf) {
        let root=tempfile::tempdir().unwrap();let (git,_)=find_git().unwrap();
        for args in [&["init","-q","-b","main"][..], &["config","user.name","Preview Test"], &["config","user.email","preview@example.invalid"], &["config","commit.gpgsign","false"], &["config","core.autocrlf","false"]] {run(&git,root.path(),args).unwrap();}
        (root,git)
    }
    fn png(tag:&str)->Vec<u8> {let mut bytes=STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6kAAAAASUVORK5CYII=").unwrap();bytes.extend_from_slice(tag.as_bytes());bytes}
    fn commit(git:&Path,repo:&Path)->String {run(git,repo,&["add","--all"]).unwrap();run(git,repo,&["commit","-qm","Snapshot"]).unwrap();String::from_utf8_lossy(&run(git,repo,&["rev-parse","HEAD"]).unwrap()).trim().into()}
    fn decoded(preview:&FilePreview)->Vec<u8> {STANDARD.decode(preview.data_url.as_ref().unwrap().split_once(',').unwrap().1).unwrap()}
    #[test]
    fn working_index_and_head_images_are_distinct_and_read_only() {
        let(root,git)=fixture();let repo=root.path();let file="[preview] تصویر.png";
        fs::write(repo.join(file),png("base")).unwrap();let head=commit(&git,repo);
        fs::write(repo.join(file),png("index")).unwrap();run(&git,repo,&["--literal-pathspecs","add","--",file]).unwrap();
        fs::write(repo.join(file),png("working")).unwrap();
        let staged=version_control::diff(&git,repo,file,true).unwrap().media.unwrap();
        assert_eq!(decoded(staged.before.as_ref().unwrap()),png("base"));assert_eq!(decoded(staged.after.as_ref().unwrap()),png("index"));
        let working=version_control::diff(&git,repo,file,false).unwrap().media.unwrap();
        assert_eq!(decoded(working.before.as_ref().unwrap()),png("index"));assert_eq!(decoded(working.after.as_ref().unwrap()),png("working"));
        assert_eq!(fs::read(repo.join(file)).unwrap(),png("working"));assert_eq!(run(&git,repo,&["show",&format!(":{file}")]).unwrap(),png("index"));
        assert_eq!(String::from_utf8_lossy(&run(&git,repo,&["rev-parse","HEAD"]).unwrap()).trim(),head);
    }
    #[test]
    fn untracked_and_unborn_staged_media_have_no_before_version() {
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("new.webp"),b"RIFF\0\0\0\0WEBPnew").unwrap();
        let new=version_control::diff(&git,repo,"new.webp",false).unwrap().media.unwrap();assert!(new.before.is_none());assert_eq!(new.after.unwrap().mime,"image/webp");
        run(&git,repo,&["add","--all"]).unwrap();let staged=version_control::diff(&git,repo,"new.webp",true).unwrap().media.unwrap();assert!(staged.before.is_none());assert!(staged.after.is_some());
    }
    #[test]
    fn commit_rename_deletion_and_revision_previews_read_immutable_blobs() {
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("before.png"),png("original")).unwrap();let root_hash=commit(&git,repo);
        run(&git,repo,&["mv","before.png","after.png"]).unwrap();let renamed=commit(&git,repo);
        fs::write(repo.join("after.png"),png("local-only")).unwrap();
        let historical=version_control::history_commit_diff(&git,repo,&renamed,"after.png").unwrap().media.unwrap();
        assert_eq!(historical.before.as_ref().unwrap().path,"before.png");assert_eq!(decoded(historical.after.as_ref().unwrap()),png("original"));
        let file_history=crate::file_history::diff(&git,repo,"after.png",&renamed).unwrap().media.unwrap();assert_eq!(decoded(file_history.before.as_ref().unwrap()),png("original"));
        let root_preview=version_control::history_commit_diff(&git,repo,&root_hash,"before.png").unwrap().media.unwrap();assert!(root_preview.before.is_none());
        let blob=crate::revision_tree::blob(&git,repo,&renamed,"after.png").unwrap();assert_eq!(decoded(blob.preview.as_ref().unwrap()),png("original"));
        fs::remove_file(repo.join("after.png")).unwrap();let deleted=commit(&git,repo);
        let deletion=version_control::history_commit_diff(&git,repo,&deleted,"after.png").unwrap().media.unwrap();assert!(deletion.after.is_none());assert_eq!(decoded(deletion.before.as_ref().unwrap()),png("original"));
    }
    #[test]
    fn large_and_unsupported_files_return_metadata_without_payloads() {
        let(root,git)=fixture();let repo=root.path();let large=fs::File::create(repo.join("huge.png")).unwrap();large.set_len(LIMIT+1).unwrap();
        let preview=read(&git,repo,Source::Working("huge.png")).unwrap().unwrap();assert_eq!(preview.size,LIMIT+1);assert!(preview.data_url.is_none());assert!(preview.unavailable.unwrap().contains("16 MiB"));
        fs::write(repo.join("archive.zip"),b"PK\0archive").unwrap();let binary=version_control::diff(&git,repo,"archive.zip",false).unwrap().media.unwrap().after.unwrap();assert_eq!(binary.size,10);assert_eq!(binary.kind,"binary");assert!(binary.data_url.is_none());
        let hash=commit(&git,repo);let blob=read(&git,repo,Source::Revision(&hash,"huge.png")).unwrap().unwrap();assert!(blob.data_url.is_none());assert_eq!(blob.size,LIMIT+1);
        for path in ["../outside.png",".git/config","/absolute.png",":(glob)*.png","folder\\image.png"] {assert!(read(&git,repo,Source::Working(path)).is_err());}
    }
    #[test]
    fn saved_stash_and_shelf_media_ignore_later_working_changes() {
        let(root,git)=fixture();let repo=root.path();fs::write(repo.join("photo.png"),png("base")).unwrap();commit(&git,repo);
        fs::write(repo.join("photo.png"),png("saved")).unwrap();
        let state=crate::git_tools::inspect(&git,repo).unwrap();crate::stash_tools::save_selected(&git,repo,&["photo.png".into()],"Preview",&state.review_token).unwrap();
        let stash=String::from_utf8_lossy(&run(&git,repo,&["rev-parse","stash@{0}"]).unwrap()).trim().to_owned();
        fs::write(repo.join("photo.png"),png("later")).unwrap();let diff=crate::stash_tools::diff(&git,repo,&stash,"photo.png","working").unwrap().media.unwrap();assert_eq!(decoded(diff.after.as_ref().unwrap()),png("saved"));
        let state=crate::shelves::inspect(&git,repo).unwrap();
        crate::shelves::execute(&git,repo,&crate::shelves::Request{action:"save".into(),id:String::new(),review_token:state.review_token,paths:vec!["photo.png".into()],message:"Preview shelf".into()}).unwrap();
        let shelf=crate::shelves::inspect(&git,repo).unwrap().entries.remove(0);
        let preview=crate::shelves::diff(&git,repo,&shelf.id,"photo.png","working").unwrap().media.unwrap();assert_eq!(decoded(preview.after.as_ref().unwrap()),png("later"));
    }
    #[cfg(unix)]
    #[test]
    fn links_and_directories_are_never_followed_or_opened() {
        use std::os::unix::fs::symlink;
        let(root,git)=fixture();let outside=tempfile::tempdir().unwrap();fs::write(outside.path().join("private.png"),png("private")).unwrap();
        symlink(outside.path(),root.path().join("linked")).unwrap();
        let preview=read(&git,root.path(),Source::Working("linked/private.png")).unwrap().unwrap();assert!(preview.data_url.is_none());assert!(preview.unavailable.unwrap().contains("Linked files"));
        assert!(read(&git,root.path(),Source::Working("linked")).unwrap().unwrap().data_url.is_none());
        fs::create_dir(root.path().join("folder.png")).unwrap();
        assert!(read(&git,root.path(),Source::Working("folder.png")).unwrap().unwrap().data_url.is_none());
    }
    #[cfg(windows)]
    #[test]
    fn windows_junctions_do_not_expose_files_outside_the_repository() {
        use std::os::windows::process::CommandExt;
        let(root,git)=fixture();let outside=tempfile::tempdir().unwrap();
        fs::write(outside.path().join("private.png"),png("private")).unwrap();
        let link=root.path().join("linked");
        let result=std::process::Command::new("cmd").creation_flags(0x08000000).args(["/c","mklink","/J"]).arg(&link).arg(outside.path()).output().unwrap();
        assert!(result.status.success());
        let preview=read(&git,root.path(),Source::Working("linked/private.png")).unwrap().unwrap();
        fs::remove_dir(&link).unwrap();
        assert!(preview.data_url.is_none());assert!(preview.unavailable.unwrap().contains("Linked files"));
        assert_eq!(fs::read(outside.path().join("private.png")).unwrap(),png("private"));
    }
}
