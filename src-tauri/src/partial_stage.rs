use crate::{git, git_tools, version_control::{self, run}};
use serde::Serialize;
use std::{fs::{self, OpenOptions}, io::Write, path::Path};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunks { pub review_token: String, pub hunks: Vec<String>, pub unavailable: Option<String> }

fn patches(git: &Path, repo: &Path, file: &str, staged: bool) -> Result<Vec<String>, String> {
    let state = version_control::changes(git, repo)?;
    let entry = state.files.iter().find(|f| f.path == file).ok_or("Select a changed file.")?;
    // Mode changes, renames, binary, conflicted, and newly created files need whole-file staging.
    if entry.original_path.is_some() || entry.status.len() != 2 || entry.status.as_bytes()[if staged { 0 } else { 1 }] != b'M' || state.conflicts > 0 {
        return Err("Partial staging is available for modified text files. Use whole-file staging for this file.".into());
    }
    let mut args = vec!["--literal-pathspecs", "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames", "--unified=3"];
    if staged { args.push("--cached"); }
    args.extend(["--", file]);
    let bytes = run(git, repo, &args)?;
    if bytes.len() > 512 * 1024 { return Err("This diff is too large for partial staging. Stage the whole file instead.".into()); }
    let text = String::from_utf8(bytes).map_err(|_| "Partial staging requires UTF-8 text.")?;
    if text.contains("\0") || text.contains("\nBinary files ") || text.contains("\nold mode ") || text.contains("\nnew mode ") {
        return Err("Partial staging is available for modified text files. Use whole-file staging for this file.".into());
    }
    let mut header = String::new();
    let mut hunks: Vec<String> = vec![];
    for line in text.split_inclusive('\n') {
        if line.starts_with("@@ ") { hunks.push(header.clone()); }
        if let Some(hunk) = hunks.last_mut() { hunk.push_str(line); } else { header.push_str(line); }
    }
    Ok(hunks)
}
pub fn read(git: &Path, repo: &Path, file: &str, staged: bool) -> Result<Hunks, String> {
    let review_token = git_tools::inspect(git, repo)?.review_token;
    match patches(git, repo, file, staged) {
        Ok(hunks) => Ok(Hunks {review_token, hunks, unavailable: None}),
        Err(reason) => Ok(Hunks {review_token, hunks: vec![], unavailable: Some(reason)}),
    }
}
pub fn apply(git: &Path, repo: &Path, file: &str, staged: bool, index: usize, token: &str) -> Result<String, String> {
    apply_lines(git, repo, file, staged, index, token, None)
}
fn selected_patch(patch: &str, staged: bool, selected: &[usize]) -> Result<String, String> {
    if selected.is_empty() || selected.len() > 10000 { return Err("Select at least one changed line.".into()); }
    if patch.contains("\\ No newline at end of file") { return Err("Stage the complete block for files without a final newline.".into()); }
    let lines: Vec<_> = patch.split_inclusive('\n').collect();
    let hunk = lines.iter().position(|line| line.starts_with("@@ ")).ok_or("Select a valid change block.")?;
    let positions: std::collections::HashSet<_> = selected.iter().copied().collect();
    if positions.iter().any(|index| *index <= hunk || *index >= lines.len() || !lines[*index].starts_with(['+', '-'])) { return Err("Select only changed lines from the reviewed block.".into()); }
    let ranges: Vec<_> = lines[hunk].split_whitespace().collect();
    let range = ranges.get(if staged {2} else {1}).ok_or("Select a valid change block.")?;
    let start: usize = range[1..].split(',').next().unwrap_or_default().parse().map_err(|_| "Select a valid change block.")?;
    let mut body = String::new(); let mut old_count = 0; let mut new_count = 0;
    let mut emit = |kind: char, line: &str| {
        old_count += usize::from(kind != '+'); new_count += usize::from(kind != '-');
        body.push(kind); body.push_str(&line[1..]);
    };
    let mut cursor = hunk + 1;
    while cursor < lines.len() {
        if lines[cursor].starts_with(' ') {emit(' ', lines[cursor]); cursor += 1; continue;}
        let mut removed = vec![]; let mut added = vec![];
        while cursor < lines.len() && lines[cursor].starts_with(['+', '-']) {
            if lines[cursor].starts_with('-') {removed.push(cursor);} else {added.push(cursor);}
            cursor += 1;
        }
        if removed.is_empty() && added.is_empty() {return Err("Select a valid text change block.".into());}
        let (source, destination) = if staged {(&added, &removed)} else {(&removed, &added)};
        // Pair replacements before retaining unselected source lines as context, so adjacent
        // selected and unselected replacements keep their original order in the index.
        for offset in 0..source.len().max(destination.len()) {
            if let Some(index) = source.get(offset) {emit(if positions.contains(index) {'-'} else {' '}, lines[*index]);}
            if let Some(index) = destination.get(offset).filter(|index| positions.contains(index)) {emit('+', lines[*index]);}
        }
    }
    let mut output = lines[..hunk].iter().filter(|line| !line.starts_with("index ")).copied().collect::<String>();
    let new_start = if new_count == 0 { start.saturating_sub(1) } else if old_count == 0 {start + 1} else {start};
    output.push_str(&format!("@@ -{start},{old_count} +{new_start},{new_count} @@\n{body}"));
    Ok(output)
}
pub fn apply_lines(git: &Path, repo: &Path, file: &str, staged: bool, index: usize, token: &str, lines: Option<&[usize]>) -> Result<String, String> {
    let state = git_tools::inspect(git, repo)?;
    if state.review_token != token { return Err("Repository changed. Refresh and review the operation again.".into()); }
    if state.operation.is_some() { return Err("Finish or abort the current Git operation first.".into()); }
    let patch = patches(git, repo, file, staged)?.into_iter().nth(index).ok_or("Select a change block from the current diff.")?;
    let patch = if let Some(lines) = lines {selected_patch(&patch, staged, lines)?} else {patch};
    let directory = version_control::git_path(git, repo, "gitorbit-patches")?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let path = directory.join(format!("{}-{}.patch", std::process::id(), git::now_ms()));
    let mut output = OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| e.to_string())?;
    let result = (|| {
        output.write_all(patch.as_bytes()).map_err(|e| e.to_string())?;
        drop(output);
        let filename = path.to_str().ok_or("The patch path is not valid UTF-8.")?;
        let mut args = vec!["apply", "--cached", "--whitespace=nowarn"];
        if staged && lines.is_none() { args.push("--reverse"); }
        args.extend(["--check", "--", filename]);
        run(git, repo, &args)?;
        args.retain(|a| *a != "--check");
        run(git, repo, &args)?;
        Ok(if staged { "Change block unstaged." } else { "Change block staged." }.into())
    })();
    let _ = fs::remove_file(path);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap(); let (git, _) = git::find_git().unwrap();
        for args in [vec!["init", "-b", "main"], vec!["config", "user.name", "Tester"], vec!["config", "user.email", "test@example.invalid"], vec!["config", "core.autocrlf", "false"], vec!["config", "commit.gpgsign", "false"]] { run(&git, dir.path(), &args).unwrap(); }
        let text = (1..=30).map(|i| format!("line {i}\n")).collect::<String>();
        fs::write(dir.path().join("file.txt"), &text).unwrap();
        run(&git, dir.path(), &["add", "."]).unwrap(); run(&git, dir.path(), &["commit", "-m", "initial"]).unwrap();
        fs::write(dir.path().join("file.txt"), text.replace("line 2\n", "first edit\n").replace("line 28\n", "second edit\n")).unwrap();
        (dir, git)
    }
    #[test]
    fn stages_one_hunk_and_unstages_it_without_changing_worktree() {
        let (dir, git) = fixture(); let repo = dir.path();
        let contents = fs::read(repo.join("file.txt")).unwrap(); let view = read(&git, repo, "file.txt", false).unwrap();
        assert_eq!(view.hunks.len(), 2);
        apply(&git, repo, "file.txt", false, 0, &view.review_token).unwrap();
        let cached = String::from_utf8(run(&git, repo, &["diff", "--cached"]).unwrap()).unwrap();
        assert!(cached.contains("first edit")); assert!(!cached.contains("second edit"));
        assert_eq!(fs::read(repo.join("file.txt")).unwrap(), contents);
        assert!(apply(&git, repo, "file.txt", false, 1, &view.review_token).is_err());
        let staged = read(&git, repo, "file.txt", true).unwrap();
        apply(&git, repo, "file.txt", true, 0, &staged.review_token).unwrap();
        assert!(run(&git, repo, &["diff", "--cached"]).unwrap().is_empty());
        assert_eq!(fs::read(repo.join("file.txt")).unwrap(), contents);
    }
    #[test]
    fn selected_lines_preserve_unselected_changes_in_index_and_worktree() {
        let (dir, git) = fixture(); let repo = dir.path();
        fs::write(repo.join("file.txt"), "base one\nbase two\ncontext\n").unwrap();
        run(&git, repo, &["add", "file.txt"]).unwrap(); run(&git, repo, &["commit", "-qm", "Line base"]).unwrap();
        fs::write(repo.join("file.txt"), "new one\nnew two\ncontext\n").unwrap();
        let content = fs::read(repo.join("file.txt")).unwrap();
        let view = read(&git, repo, "file.txt", false).unwrap();
        let selected: Vec<_> = view.hunks[0].lines().enumerate().filter_map(|(i,line)| ["-base one", "+new one"].contains(&line).then_some(i)).collect();
        apply_lines(&git, repo, "file.txt", false, 0, &view.review_token, Some(&selected)).unwrap();
        assert_eq!(String::from_utf8(run(&git, repo, &["show", ":file.txt"]).unwrap()).unwrap(), "new one\nbase two\ncontext\n");
        assert_eq!(fs::read(repo.join("file.txt")).unwrap(), content);
        let staged = read(&git, repo, "file.txt", true).unwrap();
        let selected: Vec<_> = staged.hunks[0].lines().enumerate().filter_map(|(i,line)| ["-base one", "+new one"].contains(&line).then_some(i)).collect();
        apply_lines(&git, repo, "file.txt", true, 0, &staged.review_token, Some(&selected)).unwrap();
        assert_eq!(String::from_utf8(run(&git, repo, &["show", ":file.txt"]).unwrap()).unwrap(), "base one\nbase two\ncontext\n");
        assert_eq!(fs::read(repo.join("file.txt")).unwrap(), content);
        let all = read(&git, repo, "file.txt", false).unwrap(); apply(&git, repo, "file.txt", false, 0, &all.review_token).unwrap();
        let staged = read(&git, repo, "file.txt", true).unwrap();
        let selected: Vec<_> = staged.hunks[0].lines().enumerate().filter_map(|(i,line)| ["-base one", "+new one"].contains(&line).then_some(i)).collect();
        apply_lines(&git, repo, "file.txt", true, 0, &staged.review_token, Some(&selected)).unwrap();
        assert_eq!(String::from_utf8(run(&git, repo, &["show", ":file.txt"]).unwrap()).unwrap(), "base one\nnew two\ncontext\n");
        assert_eq!(fs::read(repo.join("file.txt")).unwrap(), content);
    }
    #[test]
    fn selected_line_validation_and_missing_newline_are_explicit() {
        let patch = "diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new\n";
        for invalid in [vec![], vec![0], vec![3], vec![8]] { assert!(selected_patch(patch, false, &invalid).is_err()); }
        assert!(selected_patch(&format!("{patch}\\ No newline at end of file\n"), false, &[4]).unwrap_err().contains("final newline"));
        assert!(selected_patch(patch, false, &[4]).unwrap().contains("@@ -1,1 +0,0 @@"));
        assert!(selected_patch(patch, true, &[5]).unwrap().contains("-new\n"));
    }
    #[test]
    fn rejects_stale_content_untracked_and_conflicting_state() {
        let (dir, git) = fixture(); let repo = dir.path();
        let view = read(&git, repo, "file.txt", false).unwrap(); fs::write(repo.join("file.txt"), "changed again\n").unwrap();
        assert!(apply(&git, repo, "file.txt", false, 0, &view.review_token).is_err());
        fs::write(repo.join("new.txt"), "new\n").unwrap();
        assert!(read(&git, repo, "new.txt", false).unwrap().unavailable.is_some());
        assert!(read(&git, repo, "../outside", false).unwrap().unavailable.is_some());
    }
}
