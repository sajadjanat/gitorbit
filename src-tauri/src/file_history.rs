//! Read-only, literal-path file history and committed line provenance.
use crate::git::{capture, git_command};
use serde::Serialize;
use std::{path::{Component, Path}, time::Duration};

const MAX_COMMITS: usize = 2000;
const MAX_BLOB: usize = 2 * 1024 * 1024;
const MAX_LINES: usize = 10000;
const MAX_DIFF: usize = 512 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCommit {
    pub hash: String, pub author: String, pub timestamp: i64, pub subject: String,
    pub path: String, pub previous_path: Option<String>, pub status: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHistory { pub commits: Vec<FileCommit>, pub has_more: bool, pub shallow: bool }
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff { pub text: String, pub truncated: bool, pub before_revision: Option<String>, pub after_revision: String }
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub hash: String, pub author: String, pub timestamp: i64,
    pub original_line: usize, pub line: usize, pub path: String, pub text: String,
}
#[derive(Debug, Serialize)]
pub struct FileBlame { pub revision: String, pub lines: Vec<BlameLine>, pub truncated: bool }

fn run(git: &Path, repo: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut command = git_command(git, repo); command.args(args);
    capture(command, Duration::from_secs(30))
}
fn valid_path(file: &str) -> Result<(), String> {
    // Reject Windows paths on every host as well as traversal and Git pathspec magic.
    if file.is_empty() || file.len() > 4096 || file.contains(['\0', '\\', ':']) || file.starts_with('/')
        || !Path::new(file).components().all(|c| matches!(c, Component::Normal(_)))
        || file.split('/').any(|c| c.is_empty() || c == "." || c == ".." || c.eq_ignore_ascii_case(".git")) {
        return Err("Choose a repository-relative file path.".into());
    }
    Ok(())
}
fn is_hash(hash: &str) -> bool { matches!(hash.len(), 40 | 64) && hash.bytes().all(|b| b.is_ascii_hexdigit()) }
fn revision(git: &Path, repo: &Path, value: &str) -> Result<String, String> {
    if value != "HEAD" && !is_hash(value) { return Err("Choose a valid file revision.".into()); }
    let bytes = run(git, repo, &["rev-parse", "--verify", "--end-of-options", &format!("{value}^{{commit}}")])?;
    let hash = String::from_utf8_lossy(&bytes).trim().to_owned();
    if !is_hash(&hash) { return Err("Git returned an invalid file revision.".into()); }
    Ok(hash)
}
fn field<'a>(fields: &'a [&[u8]], index: &mut usize) -> Result<&'a [u8], String> {
    let value = fields.get(*index).ok_or("Git returned incomplete file history.")?;
    *index += 1; Ok(value)
}
fn parse_history(bytes: &[u8], file: &str) -> Result<Vec<FileCommit>, String> {
    let fields: Vec<_> = bytes.split(|b| *b == 0).collect();
    let mut index = 0; let mut current_path = file.to_owned(); let mut commits = vec![];
    while index < fields.len() {
        while index < fields.len() && fields[index].is_empty() { index += 1; }
        if index >= fields.len() { break; }
        let hash = String::from_utf8_lossy(field(&fields, &mut index)?).into_owned();
        if !is_hash(&hash) { return Err("Git returned invalid file history.".into()); }
        let author = String::from_utf8_lossy(field(&fields, &mut index)?).into_owned();
        let timestamp = String::from_utf8_lossy(field(&fields, &mut index)?).parse().map_err(|_| "Git returned an invalid commit date.")?;
        let subject = String::from_utf8_lossy(field(&fields, &mut index)?).into_owned();
        let mut entry = FileCommit { hash, author, timestamp, subject, path: current_path.clone(), previous_path: None, status: String::new() };
        while index < fields.len() {
            let status = String::from_utf8_lossy(fields[index]).trim_matches(['\r', '\n']).to_owned();
            if is_hash(&status) { break; }
            index += 1;
            if status.is_empty() { continue; }
            if !matches!(status.as_bytes()[0], b'A' | b'M' | b'D' | b'R' | b'C' | b'T' | b'U' | b'X' | b'B') {
                return Err("Git returned an invalid file change.".into());
            }
            let old = String::from_utf8_lossy(field(&fields, &mut index)?).into_owned();
            let renamed = status.starts_with(['R', 'C']);
            let path = if renamed { String::from_utf8_lossy(field(&fields, &mut index)?).into_owned() } else { old.clone() };
            if path == current_path {
                entry.path = path; entry.status = status;
                if renamed { entry.previous_path = Some(old.clone()); }
                if entry.status.starts_with('R') { current_path = old; }
            }
        }
        commits.push(entry);
    }
    Ok(commits)
}

pub fn read(git: &Path, repo: &Path, file: &str, limit: usize) -> Result<FileHistory, String> {
    valid_path(file)?;
    if !(1..=MAX_COMMITS).contains(&limit) { return Err("Choose a valid file history limit.".into()); }
    run(git, repo, &["rev-parse", "--git-dir"])?;
    let shallow = run(git, repo, &["rev-parse", "--is-shallow-repository"])? == b"true\n";
    if run(git, repo, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err() {
        return Ok(FileHistory { commits: vec![], has_more: false, shallow });
    }
    let count = format!("--max-count={}", limit + 1);
    let bytes = run(git, repo, &["--literal-pathspecs", "log", "--follow", "--find-renames", "--diff-merges=first-parent", "--no-ext-diff", "--no-textconv", "--no-show-signature", "--no-color", "--encoding=UTF-8", "--format=%H%x00%an%x00%at%x00%s%x00", "--name-status", "-z", &count, "HEAD", "--", file])?;
    let mut commits = parse_history(&bytes, file)?; let has_more = commits.len() > limit; commits.truncate(limit);
    Ok(FileHistory { commits, has_more, shallow })
}

pub fn diff(git: &Path, repo: &Path, file: &str, commit_hash: &str) -> Result<FileDiff, String> {
    valid_path(file)?; let hash = revision(git, repo, commit_hash)?;
    let parents = run(git, repo, &["rev-list", "--parents", "-n", "1", &hash])?;
    let parent = String::from_utf8_lossy(&parents).split_whitespace().nth(1).map(str::to_owned);
    // Inspect the complete changed-path list before filtering, so rename previews include both names.
    let mut names_args = vec!["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-z", "--find-renames"];
    if let Some(p) = &parent { names_args.push(p); } names_args.push(&hash);
    let names = run(git, repo, &names_args)?;
    let parts: Vec<_> = names.split(|b| *b == 0).collect(); let mut i = 0; let mut previous: Option<String> = None; let mut found = false;
    while i < parts.len() && !parts[i].is_empty() {
        let status = String::from_utf8_lossy(parts[i]); i += 1;
        let a = String::from_utf8_lossy(field(&parts, &mut i)?).into_owned();
        if status.starts_with(['R', 'C']) {
            let b = String::from_utf8_lossy(field(&parts, &mut i)?).into_owned();
            if b == file { previous = Some(a); found = true; }
            else if a == file { previous = Some(b); found = true; }
        } else if a == file { found = true; }
    }
    if !found { return Err("This file has no change in the selected commit. Refresh its history.".into()); }
    let mut args = vec!["--literal-pathspecs"];
    if let Some(p) = &parent { args.extend(["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--find-renames", p, &hash]); }
    else { args.extend(["diff-tree", "--root", "--no-commit-id", "-r", "-p", "--no-ext-diff", "--no-textconv", "--no-color", &hash]); }
    args.extend(["--", file]); if let Some(old) = &previous { args.push(old); }
    let mut bytes = run(git, repo, &args)?; let truncated = bytes.len() > MAX_DIFF; bytes.truncate(MAX_DIFF);
    Ok(FileDiff { text: String::from_utf8_lossy(&bytes).into_owned(), truncated, before_revision: parent, after_revision: hash })
}

fn unquote_path(value: &str) -> String {
    if !value.starts_with('"') || !value.ends_with('"') { return value.into(); }
    let bytes = &value.as_bytes()[1..value.len()-1]; let mut output = vec![]; let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'\\' { output.push(bytes[i]); i += 1; continue; }
        i += 1; if i >= bytes.len() { break; }
        if (b'0'..=b'7').contains(&bytes[i]) {
            let mut v: u16 = 0; let mut n = 0;
            while i < bytes.len() && n < 3 && (b'0'..=b'7').contains(&bytes[i]) { v = v * 8 + u16::from(bytes[i] - b'0'); i += 1; n += 1; }
            output.push(v as u8);
        } else { output.push(match bytes[i] { b't' => b'\t', b'n' => b'\n', b'r' => b'\r', b'b' => 8, b'f' => 12, b'v' => 11, b'a' => 7, other => other }); i += 1; }
    }
    String::from_utf8_lossy(&output).into_owned()
}
fn parse_blame(bytes: &[u8]) -> Result<Vec<BlameLine>, String> {
    let text = String::from_utf8_lossy(bytes); let mut input = text.lines(); let mut lines = vec![];
    while let Some(header) = input.next() {
        let fields: Vec<_> = header.split_whitespace().collect();
        if fields.len() < 3 || !is_hash(fields[0]) { return Err("Git returned incomplete line annotations.".into()); }
        let mut line = BlameLine { hash: fields[0].into(), original_line: fields[1].parse().map_err(|_| "Invalid original line number.")?, line: fields[2].parse().map_err(|_| "Invalid line number.")?, author: String::new(), timestamp: 0, path: String::new(), text: String::new() };
        let mut complete = false;
        for metadata in input.by_ref() {
            if let Some(source) = metadata.strip_prefix('\t') { line.text = source.into(); complete = true; break; }
            if let Some(author) = metadata.strip_prefix("author ") { line.author = author.into(); }
            if let Some(time) = metadata.strip_prefix("author-time ") { line.timestamp = time.parse().map_err(|_| "Invalid annotation date.")?; }
            if let Some(path) = metadata.strip_prefix("filename ") { line.path = unquote_path(path); }
        }
        if !complete { return Err("Git returned incomplete line annotations.".into()); }
        lines.push(line);
    }
    Ok(lines)
}
pub fn blame(git: &Path, repo: &Path, file: &str, selected_revision: &str) -> Result<FileBlame, String> {
    valid_path(file)?; let hash = revision(git, repo, selected_revision)?;
    let object = format!("{hash}:{file}");
    let size = String::from_utf8_lossy(&run(git, repo, &["cat-file", "-s", &object])?).trim().parse::<usize>().map_err(|_| "Could not read file size.")?;
    if size > MAX_BLOB { return Err("This file is too large for line annotations (2 MiB limit).".into()); }
    let blob = run(git, repo, &["cat-file", "blob", &object])?;
    if blob.contains(&0) || std::str::from_utf8(&blob).is_err() { return Err("Line annotations are available for UTF-8 text files only.".into()); }
    let count = blob.iter().filter(|b| **b == b'\n').count() + usize::from(!blob.is_empty() && blob.last() != Some(&b'\n'));
    if count == 0 { return Ok(FileBlame { revision: hash, lines: vec![], truncated: false }); }
    let range = format!("1,{}", count.min(MAX_LINES));
    let output = run(git, repo, &["--literal-pathspecs", "blame", "--line-porcelain", "--encoding=UTF-8", "--no-textconv", "-L", &range, &hash, "--", file])?;
    Ok(FileBlame { revision: hash, lines: parse_blame(&output)?, truncated: count > MAX_LINES })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::find_git;
    use std::fs;
    fn fixture() -> (tempfile::TempDir, std::path::PathBuf) {
        let root = tempfile::tempdir().unwrap(); let (git, _) = find_git().expect("Git required");
        for args in [&["init", "-q", "-b", "main"][..], &["config", "user.name", "Demo Author"], &["config", "user.email", "demo@example.test"], &["config", "commit.gpgsign", "false"], &["config", "core.autocrlf", "false"]] { run(&git, root.path(), args).unwrap(); }
        (root, git)
    }
    fn commit(git: &Path, repo: &Path, title: &str) -> String {
        run(git, repo, &["add", "--all"]).unwrap(); run(git, repo, &["commit", "-qm", title]).unwrap(); revision(git, repo, "HEAD").unwrap()
    }
    #[test]
    fn follows_renames_previews_root_rename_and_deletion_and_retains_line_provenance() {
        let (root, git) = fixture(); let repo = root.path();
        fs::write(repo.join("original.txt"), "first\nsecond\n").unwrap(); let first = commit(&git, repo, "First");
        run(&git, repo, &["mv", "original.txt", "renamed.txt"]).unwrap(); let rename = commit(&git, repo, "Rename");
        fs::write(repo.join("renamed.txt"), "inserted\nfirst\nchanged\n").unwrap(); let last = commit(&git, repo, "Update");
        let history = read(&git, repo, "renamed.txt", 200).unwrap(); assert_eq!(history.commits.len(), 3);
        assert_eq!(history.commits[1].previous_path.as_deref(), Some("original.txt")); assert_eq!(history.commits[2].path, "original.txt");
        assert!(read(&git, repo, "renamed.txt", 1).unwrap().has_more);
        let annotations = blame(&git, repo, "renamed.txt", "HEAD").unwrap(); assert_eq!(annotations.revision, last); assert_eq!(annotations.lines.len(), 3);
        let line = &annotations.lines[1]; assert_eq!(line.text, "first"); assert_eq!(line.hash, first); assert_eq!(line.original_line, 1); assert_eq!(line.line, 2); assert_eq!(line.path, "original.txt"); assert_eq!(line.author, "Demo Author"); assert!(line.timestamp > 0);
        assert!(diff(&git, repo, "renamed.txt", &rename).unwrap().text.contains("rename from original.txt"));
        assert!(diff(&git, repo, "original.txt", &rename).unwrap().text.contains("rename from original.txt"));
        let initial = diff(&git, repo, "original.txt", &first).unwrap(); assert!(initial.before_revision.is_none()); assert!(initial.text.contains("+first"));
        fs::remove_file(repo.join("renamed.txt")).unwrap(); let deleted = commit(&git, repo, "Delete");
        assert!(diff(&git, repo, "renamed.txt", &deleted).unwrap().text.contains("+++ /dev/null"));
        assert_eq!(read(&git, repo, "renamed.txt", 200).unwrap().commits[0].status, "D");
        assert!(blame(&git, repo, "renamed.txt", "HEAD").is_err());
        assert_eq!(blame(&git, repo, "renamed.txt", &last).unwrap().lines.len(), 3);
    }
    #[test]
    fn literal_paths_binary_large_files_and_unborn_history() {
        let (root, git) = fixture(); let repo = root.path();
        assert!(read(&git, repo, "new.txt", 10).unwrap().commits.is_empty());
        fs::write(repo.join("[literal].txt"), "literal\n").unwrap(); fs::write(repo.join("binary.dat"), b"a\0b").unwrap();
        fs::write(repo.join("large.txt"), vec![b'x'; MAX_BLOB+1]).unwrap(); let hash = commit(&git, repo, "Files");
        assert_eq!(read(&git, repo, "[literal].txt", 10).unwrap().commits.len(), 1);
        assert!(diff(&git, repo, "[literal].txt", &hash).unwrap().text.contains("+literal"));
        assert!(blame(&git, repo, "binary.dat", "HEAD").unwrap_err().contains("UTF-8"));
        assert!(blame(&git, repo, "large.txt", "HEAD").unwrap_err().contains("too large"));
        assert!(diff(&git, repo, "binary.dat", &hash).unwrap().text.contains("Binary files"));
        for path in ["../outside", "/outside", "C:/file", ":(glob)*", ".git/config", "folder/../a", "a\\b"] { assert!(read(&git, repo, path, 10).is_err()); assert!(blame(&git, repo, path, "HEAD").is_err()); }
        assert!(diff(&git, repo, "[literal].txt", "--help").is_err()); assert!(read(&git, repo, "[literal].txt", 0).is_err());
    }
    #[test]
    fn limits_line_output_and_does_not_include_working_tree_edits() {
        let (root, git) = fixture(); let repo = root.path();
        fs::write(repo.join("lines.txt"), "line\n".repeat(MAX_LINES+1)).unwrap(); commit(&git, repo, "Lines");
        fs::write(repo.join("lines.txt"), "uncommitted\n").unwrap();
        let lines = blame(&git, repo, "lines.txt", "HEAD").unwrap(); assert!(lines.truncated); assert_eq!(lines.lines.len(), MAX_LINES); assert_eq!(lines.lines[0].text, "line");
    }
    #[test]
    fn decodes_git_quoted_provenance_paths() {
        assert_eq!(unquote_path("\"hello\\tworld\\040file\""), "hello\tworld file");
    }
    #[test]
    fn merge_commit_and_names_with_spaces_or_newlines_remain_literal() {
        let (root, git) = fixture(); let repo = root.path();
        let name = "source with spaces.txt";
        fs::write(repo.join(name), "base\n").unwrap(); commit(&git, repo, "Initial");
        run(&git, repo, &["checkout", "-qb", "feature"]).unwrap();
        fs::write(repo.join(name), "feature\n").unwrap(); let feature = commit(&git, repo, "Feature");
        run(&git, repo, &["checkout", "-q", "main"]).unwrap();
        fs::write(repo.join("other.txt"), "other\n").unwrap(); commit(&git, repo, "Other");
        run(&git, repo, &["merge", "--no-ff", "-qm", "Merge feature", "feature"]).unwrap();
        let head = revision(&git, repo, "HEAD").unwrap();
        let history = read(&git, repo, name, 200).unwrap(); assert!(history.commits.iter().any(|c| c.hash == feature));
        assert!(diff(&git, repo, name, &head).unwrap().text.contains("+feature"));
        assert_eq!(blame(&git, repo, name, "HEAD").unwrap().lines[0].hash, feature);
        #[cfg(not(windows))] {
            let special = "source\nwith\ttabs.txt";
            fs::write(repo.join(special), "text\n").unwrap(); commit(&git, repo, "Unusual path");
            assert_eq!(read(&git, repo, special, 10).unwrap().commits[0].path, special);
            assert_eq!(blame(&git, repo, special, "HEAD").unwrap().lines[0].path, special);
        }
    }
}
