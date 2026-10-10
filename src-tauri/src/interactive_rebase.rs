use crate::{git, git_tools, version_control::{self, run}};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit { pub hash: String, pub subject: String, pub message: String }
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub review_token: String, pub head: String, pub base: String, pub commits: Vec<Commit>,
    pub blocked_reason: Option<String>, pub published: bool, pub shallow: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Step { pub hash: String, pub action: String, pub message: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request { pub review_token: String, pub base: String, pub steps: Vec<Step>, pub allow_published: bool }
fn text(git: &Path, repo: &Path, args: &[&str]) -> Result<String, String> {
    Ok(String::from_utf8_lossy(&run(git, repo, args)?).trim_end_matches(['\r', '\n']).to_owned())
}

pub fn inspect(git: &Path, repo: &Path, base: &str) -> Result<Info, String> {
    let state = git_tools::inspect(git, repo)?;
    let changes = version_control::changes(git, repo)?;
    let shallow = text(git, repo, &["rev-parse", "--is-shallow-repository"])? == "true";
    let blocked_reason = if state.head.is_empty() { Some("Create an initial commit before rebasing.".into()) }
        else if changes.detached { Some("Select a branch before rebasing.".into()) }
        else if state.operation.is_some() { Some("Finish or abort the current Git operation before rebasing.".into()) }
        else if changes.changed > 0 { Some("Commit or stash local changes before rebasing.".into()) }
        else if shallow { Some("Fetch the complete history before interactive rebase.".into()) }
        else { None };
    if blocked_reason.is_some() {
        return Ok(Info {review_token: state.review_token, head: state.head, base: String::new(), commits: vec![], blocked_reason, published: false, shallow});
    }
    let base = if base.trim().is_empty() {
        let history = text(git, repo, &["rev-list", "--first-parent", "--max-count=11", "HEAD"])?;
        let hashes: Vec<_> = history.lines().collect();
        if hashes.len() < 2 { return Err("Create a second commit before interactive rebase.".into()); }
        hashes.last().unwrap().to_string()
    } else {
        if base.len() > 512 || base.starts_with('-') || base.contains('\0') { return Err("Select a valid rebase base revision.".into()); }
        text(git, repo, &["rev-parse", "--verify", "--end-of-options", &format!("{}^{{commit}}", base.trim())])?
    };
    if run(git, repo, &["merge-base", "--is-ancestor", &base, &state.head]).is_err() {
        return Err("The rebase base must be an ancestor of the current branch.".into());
    }
    let range = format!("{base}..{}", state.head);
    let hashes = text(git, repo, &["rev-list", "--reverse", "--topo-order", "--max-count=101", &range])?;
    let hashes: Vec<_> = hashes.lines().collect();
    if hashes.is_empty() { return Err("Select a base before the commits you want to edit.".into()); }
    if hashes.len() > 100 { return Err("Interactive rebase supports at most 100 commits at a time.".into()); }
    if !text(git, repo, &["rev-list", "--merges", &range])?.is_empty() {
        return Err("Interactive rebase currently supports linear history without merge commits.".into());
    }
    let mut commits = Vec::new();
    for hash in &hashes {
        let message = text(git, repo, &["show", "-s", "--format=%B", hash])?;
        commits.push(Commit {hash: hash.to_string(), subject: message.lines().next().unwrap_or_default().into(), message});
    }
    let unpublished = text(git, repo, &["rev-list", &range, "--not", "--remotes"])?;
    let published = unpublished.lines().count() < hashes.len();
    Ok(Info {review_token: state.review_token, head: state.head, base, commits, blocked_reason: None, published, shallow})
}

// Git executes editor/exec commands through its POSIX shell on every supported platform.
// Quote only executable/generated file paths. Messages are never embedded in commands.
fn quote_path(path: &Path) -> Result<String, String> {
    let path = path.to_str().ok_or("The editor path is not valid UTF-8.")?;
    #[cfg(windows)] let path = path.replace('\\', "/");
    #[cfg(not(windows))] let path = path.to_owned();
    if path.contains(['\r', '\n', '\0']) { return Err("The editor path contains an unsupported character.".into()); }
    Ok(format!("'{}'", path.replace('\'', "'\\''")))
}

fn plan(git: &Path, directory: &Path, reviewed: &Info, request: &Request) -> Result<String, String> {
    if request.steps.len() != reviewed.commits.len() { return Err("Include each reviewed commit exactly once in the rebase plan.".into()); }
    let mut seen = std::collections::HashSet::new();
    let mut current_message = None::<String>;
    let mut todo = String::new();
    for (index, step) in request.steps.iter().enumerate() {
        let original = reviewed.commits.iter().find(|c| c.hash == step.hash)
            .ok_or("The rebase plan contains a commit that was not reviewed.")?;
        if !seen.insert(&step.hash) { return Err("Include each reviewed commit exactly once in the rebase plan.".into()); }
        if !["pick", "reword", "squash", "fixup", "drop"].contains(&step.action.as_str()) {
            return Err("Choose a supported rebase action.".into());
        }
        if ["reword", "squash"].contains(&step.action.as_str()) && (step.message.trim().is_empty() || step.message.len() > 65536 || step.message.contains('\0')) {
            return Err("Enter a valid message for every reword or squash step.".into());
        }
        match step.action.as_str() {
            "drop" => { todo.push_str(&format!("drop {}\n", step.hash)); continue; }
            "pick" | "reword" => { current_message = Some(if step.action == "reword" {step.message.clone()} else {original.message.clone()}); }
            "squash" | "fixup" => {
                let previous = current_message.as_mut().ok_or("The first kept commit must use pick or reword.")?;
                if step.action == "squash" { previous.push_str("\n\n"); previous.push_str(&step.message); }
            }
            _ => unreachable!(),
        }
        todo.push_str(&format!("{} {}\n", if ["squash", "fixup"].contains(&step.action.as_str()) { "fixup" } else { "pick" }, step.hash));
        if ["reword", "squash"].contains(&step.action.as_str()) {
            let message_file = directory.join(format!("message-{index}.txt"));
            fs::write(&message_file, current_message.as_ref().unwrap()).map_err(|e| e.to_string())?;
            todo.push_str(&format!("exec {} commit --amend --only -F {}\n", quote_path(git)?, quote_path(&message_file)?));
        }
    }
    if current_message.is_none() { return Err("Keep at least one commit in the rebase plan.".into()); }
    Ok(todo)
}

pub fn start(git: &Path, repo: &Path, request: &Request) -> Result<String, String> {
    let reviewed = inspect(git, repo, &request.base)?;
    if request.review_token != reviewed.review_token { return Err("Repository changed. Refresh and review the operation again.".into()); }
    if let Some(reason) = &reviewed.blocked_reason { return Err(reason.clone()); }
    if reviewed.published && !request.allow_published { return Err("Acknowledge rewriting published history before rebasing.".into()); }
    let directory = version_control::git_path(git, repo, &format!("gitorbit-rebase/{}", git::now_ms()))?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let directory = fs::canonicalize(&directory).map_err(|e| e.to_string())?;
    let directory = normalize_windows_path(&directory);
    let todo_file = directory.join("todo.txt");
    let todo = match plan(git, &directory, &reviewed, request) {
        Ok(todo) => todo,
        Err(error) => { let _ = fs::remove_dir_all(&directory); return Err(error); }
    };
    fs::write(&todo_file, todo).map_err(|e| e.to_string())?;
    let executable = normalize_windows_path(&std::env::current_exe().map_err(|e| e.to_string())?);
    let sequence_editor = sequence_editor(&executable, &todo_file)?;
    start_with_editor(git, repo, request, &reviewed, &sequence_editor)
}

fn normalize_windows_path(path: &Path) -> std::path::PathBuf {
    #[cfg(windows)] {
        let value = path.to_string_lossy();
        if let Some(unc) = value.strip_prefix(r"\\?\UNC\") { return std::path::PathBuf::from(format!(r"\\{unc}")); }
        std::path::PathBuf::from(value.strip_prefix(r"\\?\").unwrap_or(&value))
    }
    #[cfg(not(windows))] { path.to_path_buf() }
}

fn sequence_editor(executable: &Path, todo: &Path) -> Result<String, String> {
    #[cfg(not(test))] { Ok(format!("{} --gitorbit-sequence-editor {}", quote_path(executable)?, quote_path(todo)?)) }
    // The libtest executable has no normal application entry point. Exercise the real Git
    // sequencer with its shell's equivalent copy command; application smoke covers entry wiring.
    #[cfg(test)] { let _ = executable; Ok(format!("cp -- {}", quote_path(todo)?)) }
}

fn start_with_editor(git: &Path, repo: &Path, request: &Request, reviewed: &Info, editor: &str) -> Result<String, String> {
    // Check again immediately before mutation, after plan files were prepared.
    if git_tools::inspect(git, repo)?.review_token != request.review_token {
        return Err("Repository changed. Refresh and review the operation again.".into());
    }
    let recovery = format!("refs/gitorbit/recovery/{}-interactive-rebase-{}", git::now_ms(), &reviewed.head[..8]);
    run(git, repo, &["update-ref", &recovery, &reviewed.head])?;
    let sequence = format!("sequence.editor={editor}");
    // All message changes are explicit controlled exec steps; continue works with core.editor=true.
    // Keep plan files so conflicts can be resolved, then continued or aborted through Git operations.
    run(git, repo, &["-c", "core.editor=true", "-c", &sequence, "-c", "rebase.updateRefs=false", "rebase", "--interactive", "--no-autosquash", "--no-autostash", "--no-update-refs", "--no-rebase-merges", &reviewed.base])?;
    Ok("Interactive rebase completed. Review outgoing commits before pushing.".into())
}

/// Called before either application entry point; returns None for ordinary startup.
pub fn editor_entry() -> Option<i32> {
    let args: Vec<_> = std::env::args_os().collect();
    if args.get(1).and_then(|a| a.to_str()) != Some("--gitorbit-sequence-editor") { return None; }
    if args.len() != 4 { return Some(2); }
    Some(match fs::copy(&args[2], &args[3]) { Ok(_) => 0, Err(_) => 1 })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    fn fixture() -> (tempfile::TempDir, PathBuf, String) {
        let root = tempfile::Builder::new().prefix("rebase quoted ' path ").tempdir().unwrap();
        let (git, _) = git::find_git().unwrap();
        run(&git, root.path(), &["init", "-q", "-b", "main"]).unwrap();
        for args in [["config", "user.name", "Rebase Test"], ["config", "user.email", "rebase@example.com"], ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"]] {run(&git, root.path(), &args).unwrap();}
        save(&git, root.path(), "root.txt", "root\n", "Root");
        let base = text(&git, root.path(), &["rev-parse", "HEAD"]).unwrap();
        (root, git, base)
    }
    fn save(git: &Path, repo: &Path, path: &str, content: &str, message: &str) {
        fs::write(repo.join(path), content).unwrap(); run(git, repo, &["add", "--", path]).unwrap(); run(git, repo, &["commit", "-qm", message]).unwrap();
    }
    fn request(git: &Path, repo: &Path, base: &str) -> Request {
        let state = inspect(git, repo, base).unwrap();
        Request {review_token: state.review_token, base: state.base, allow_published: false, steps: state.commits.into_iter().map(|c| Step {hash: c.hash, action: "pick".into(), message: c.message}).collect()}
    }
    #[test]
    fn reword_squash_fixup_and_drop_use_message_files_and_keep_recovery() {
        let (root, git, base) = fixture(); let repo = root.path();
        save(&git, repo, "a.txt", "a\n", "A"); save(&git, repo, "b.txt", "b\n", "B");
        save(&git, repo, "c.txt", "c\n", "C"); save(&git, repo, "d.txt", "d\n", "D");
        let old_head = text(&git, repo, &["rev-parse", "HEAD"]).unwrap();
        let mut r = request(&git, repo, &base);
        r.steps[0].action = "reword".into(); r.steps[0].message = "Reworded ' text $(touch injected) `touch injected2`\n\nBody".into();
        r.steps[1].action = "squash".into(); r.steps[1].message = "Squash body".into();
        r.steps[2].action = "fixup".into(); r.steps[3].action = "drop".into();
        start(&git, repo, &r).unwrap();
        assert_eq!(text(&git, repo, &["rev-list", "--count", &format!("{base}..HEAD")]).unwrap(), "1");
        let message = text(&git, repo, &["show", "-s", "--format=%B", "HEAD"]).unwrap();
        assert!(message.contains("$(touch injected)")); assert!(message.contains("Squash body")); assert!(!message.contains("\nC"));
        assert!(!repo.join("injected").exists()); assert!(!repo.join("injected2").exists());
        assert!(repo.join("a.txt").exists()); assert!(repo.join("b.txt").exists()); assert!(repo.join("c.txt").exists()); assert!(!repo.join("d.txt").exists());
        assert!(git_tools::inspect(&git, repo).unwrap().refs.iter().any(|r| r.kind == "recovery" && r.hash == old_head));
    }
    #[test]
    fn independent_commits_can_be_reordered() {
        let (root, git, base) = fixture(); let repo = root.path();
        save(&git, repo, "a.txt", "a\n", "A"); save(&git, repo, "b.txt", "b\n", "B");
        let mut r = request(&git, repo, &base); r.steps.swap(0, 1); start(&git, repo, &r).unwrap();
        assert_eq!(text(&git, repo, &["log", "--reverse", "--format=%s", &format!("{base}..HEAD")]).unwrap(), "B\nA");
    }
    #[test]
    fn published_history_requires_acknowledgement_and_never_pushes() {
        let (root, git, base) = fixture(); let repo = root.path(); save(&git, repo, "a.txt", "a\n", "A");
        let old = text(&git, repo, &["rev-parse", "HEAD"]).unwrap(); run(&git, repo, &["update-ref", "refs/remotes/origin/main", &old]).unwrap();
        let mut r = request(&git, repo, &base); r.steps[0].action = "reword".into(); r.steps[0].message = "Changed".into();
        assert!(inspect(&git, repo, &base).unwrap().published);
        assert!(start(&git, repo, &r).unwrap_err().contains("Acknowledge"));
        r.allow_published = true; start(&git, repo, &r).unwrap();
        assert_eq!(text(&git, repo, &["rev-parse", "refs/remotes/origin/main"]).unwrap(), old);
    }
    #[test]
    fn stale_dirty_and_invalid_plans_are_refused() {
        let (root, git, base) = fixture(); let repo = root.path(); save(&git, repo, "a.txt", "a\n", "A");
        let old = request(&git, repo, &base); save(&git, repo, "b.txt", "b\n", "B");
        assert!(start(&git, repo, &old).unwrap_err().contains("Repository changed"));
        let r = request(&git, repo, &base); fs::write(repo.join("root.txt"), "dirty\n").unwrap();
        assert!(start(&git, repo, &r).is_err());
        run(&git, repo, &["restore", "root.txt"]).unwrap();
        let mut r = request(&git, repo, &base); r.steps[0].action = "squash".into(); assert!(start(&git, repo, &r).is_err());
        let mut r = request(&git, repo, &base); r.steps[1].hash = r.steps[0].hash.clone(); assert!(start(&git, repo, &r).is_err());
        let mut r = request(&git, repo, &base); for s in &mut r.steps {s.action = "drop".into();} assert!(start(&git, repo, &r).is_err());
    }
    #[test]
    fn conflict_can_be_aborted_or_resolved_and_continued_with_reword() {
        let (root, git, base) = fixture(); let repo = root.path();
        save(&git, repo, "root.txt", "first\n", "First"); save(&git, repo, "root.txt", "second\n", "Second");
        let old_head = text(&git, repo, &["rev-parse", "HEAD"]).unwrap();
        let mut r = request(&git, repo, &base); r.steps[0].action = "drop".into(); r.steps[1].action = "reword".into(); r.steps[1].message = "Resolved reword\n\nRetained body".into();
        assert!(start(&git, repo, &r).is_err());
        assert!(git_tools::inspect(&git, repo).unwrap().operation.is_some());
        run(&git, repo, &["rebase", "--abort"]).unwrap(); assert_eq!(text(&git, repo, &["rev-parse", "HEAD"]).unwrap(), old_head);
        let mut r = request(&git, repo, &base); r.steps[0].action = "drop".into(); r.steps[1].action = "reword".into(); r.steps[1].message = "Resolved reword\n\nRetained body".into();
        assert!(start(&git, repo, &r).is_err());
        fs::write(repo.join("root.txt"), "resolved\n").unwrap(); run(&git, repo, &["add", "root.txt"]).unwrap();
        run(&git, repo, &["-c", "core.editor=true", "rebase", "--continue"]).unwrap();
        assert_eq!(text(&git, repo, &["show", "-s", "--format=%B", "HEAD"]).unwrap(), "Resolved reword\n\nRetained body");
        assert_eq!(fs::read_to_string(repo.join("root.txt")).unwrap(), "resolved\n");
        assert!(git_tools::inspect(&git, repo).unwrap().operation.is_none());
    }
    #[test]
    fn merge_ranges_and_detached_heads_are_refused() {
        let (root, git, base) = fixture(); let repo = root.path();
        run(&git, repo, &["checkout", "-qb", "feature"]).unwrap(); save(&git, repo, "a.txt", "a\n", "A");
        run(&git, repo, &["checkout", "-q", "main"]).unwrap(); save(&git, repo, "b.txt", "b\n", "B");
        run(&git, repo, &["merge", "--no-ff", "--no-edit", "feature"]).unwrap();
        assert!(inspect(&git, repo, &base).unwrap_err().contains("linear history"));
        run(&git, repo, &["checkout", "--detach", "-q"]).unwrap();
        assert!(inspect(&git, repo, &base).unwrap().blocked_reason.unwrap().contains("Select a branch"));
    }
    #[test]
    fn shallow_history_is_refused() {
        let (root, git, base) = fixture(); let repo = root.path(); save(&git, repo, "a.txt", "a\n", "A");
        let head = text(&git, repo, &["rev-parse", "HEAD"]).unwrap();
        let shallow = version_control::git_path(&git, repo, "shallow").unwrap(); fs::write(&shallow, format!("{head}\n")).unwrap();
        let state = inspect(&git, repo, &base).unwrap(); assert!(state.shallow);
        assert!(state.blocked_reason.unwrap().contains("complete history"));
    }
}
