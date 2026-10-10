use crate::{git, git_tools, version_control::{self, run}};
use serde::{Deserialize, Serialize};
use std::{collections::hash_map::DefaultHasher, hash::{Hash, Hasher}, path::Path};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub review_token: String,
    pub head: String,
    pub previous_message: String,
    pub can_amend: bool,
    pub blocked_reason: Option<String>,
    pub staged: usize,
    pub published: bool,
    pub sign_off_identity: Option<String>,
    pub default_author_name: String,
    pub default_author_email: String,
    pub previous_author_name: String,
    pub previous_author_email: String,
    pub signing_enabled: bool,
    pub signing_key: Option<String>,
    pub signing_format: String,
}

#[derive(Deserialize)]
pub struct Author {pub name: String, pub email: String}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub review_token: String,
    pub message: String,
    pub amend: bool,
    pub sign_off: bool,
    #[serde(default)]
    pub author: Option<Author>,
    #[serde(default)]
    pub sign: Option<bool>,
}

fn text(git: &Path, repo: &Path, args: &[&str]) -> Result<String, String> {
    Ok(String::from_utf8_lossy(&run(git, repo, args)?).trim_end_matches(['\r', '\n']).to_owned())
}

pub fn info(git: &Path, repo: &Path) -> Result<Info, String> {
    let state = git_tools::inspect(git, repo)?;
    let changes = version_control::changes(git, repo)?;
    let blocked_reason = if state.head.is_empty() {
        Some("Create an initial commit before amending.".into())
    } else if changes.detached {
        Some("Select a branch before amending.".into())
    } else if state.operation.is_some() {
        Some("Finish or abort the current Git operation before amending.".into())
    } else if state.conflicts > 0 {
        Some("Resolve and stage all conflicts before amending.".into())
    } else if text(git, repo, &["show", "-s", "--format=%P", &state.head])?.split_whitespace().count() > 1 {
        Some("Amending a merge commit is not supported.".into())
    } else { None };
    let previous_message = if state.head.is_empty() { String::new() }
        else { text(git, repo, &["show", "-s", "--format=%B", &state.head])? };
    let published = !state.head.is_empty()
        && !text(git, repo, &["for-each-ref", "--contains", &state.head, "--format=%(refname)", "refs/remotes/"])?.is_empty();
    // Git resolves includes, worktree config and environment identity consistently with --signoff.
    let sign_off_identity = text(git, repo, &["var", "GIT_COMMITTER_IDENT"]).ok()
        .and_then(|identity| identity.rfind('>').map(|end| identity[..=end].to_owned()));
    let author_identity = text(git, repo, &["var", "GIT_AUTHOR_IDENT"]).unwrap_or_default();
    let (default_author_name, default_author_email) = author_identity.rfind('<').and_then(|start| {
        author_identity[start..].find('>').map(|end| (author_identity[..start].trim().to_owned(), author_identity[start+1..start+end].to_owned()))
    }).unwrap_or_default();
    let previous_author = if state.head.is_empty() {String::new()} else {text(git, repo, &["show", "-s", "--format=%an%x00%ae", &state.head])?};
    let (previous_author_name, previous_author_email) = previous_author.split_once('\0').map(|(name,email)| (name.to_owned(),email.to_owned())).unwrap_or_default();
    let signing_enabled = if text(git, repo, &["config", "--get", "commit.gpgsign"]).is_ok() {
        text(git, repo, &["config", "--type=bool", "--get", "commit.gpgsign"])? == "true"
    } else {false};
    let signing_key = text(git, repo, &["config", "--get", "user.signingkey"]).ok().filter(|key| !key.is_empty());
    let signing_format = text(git, repo, &["config", "--get", "gpg.format"]).unwrap_or_else(|_| "openpgp".into());
    // Also bind the identity shown for sign-off, which can originate in global config.
    let mut token = DefaultHasher::new();
    (&state.review_token, &sign_off_identity, &default_author_name, &default_author_email, signing_enabled, &signing_key, &signing_format).hash(&mut token);
    Ok(Info { review_token: format!("{:016x}", token.finish()), head: state.head, previous_message,
        can_amend: blocked_reason.is_none(), blocked_reason, staged: changes.staged,
        published, sign_off_identity, default_author_name, default_author_email,
        previous_author_name, previous_author_email, signing_enabled, signing_key, signing_format })
}

pub fn commit(git: &Path, repo: &Path, request: &Request) -> Result<String, String> {
    if request.message.trim().is_empty() { return Err("Enter a commit message.".into()); }
    if request.message.len() > 65536 || request.message.contains('\0') {
        return Err("The commit message is too long or contains an invalid character.".into());
    }
    let reviewed = info(git, repo)?;
    if reviewed.review_token != request.review_token {
        return Err("Repository changed. Refresh and review the operation again.".into());
    }
    if request.amend {
        if let Some(reason) = reviewed.blocked_reason { return Err(reason); }
    } else {
        let state = version_control::changes(git, repo)?;
        if state.staged == 0 { return Err("Stage files before committing.".into()); }
        if state.conflicts > 0 { return Err("Resolve and stage all conflicts before committing.".into()); }
    }
    if request.sign_off && reviewed.sign_off_identity.is_none() {
        return Err("Configure your Git name and email before adding a sign-off.".into());
    }
    let author = request.author.as_ref().map(|author| {
        let name = author.name.trim(); let email = author.email.trim();
        if name.is_empty() || name.len() > 255 || name.chars().any(|c| c.is_control() || matches!(c, '<' | '>'))
            || email.len() > 320 || !email.contains('@') || email.matches('@').count() != 1 || email.starts_with('@') || email.ends_with('@')
            || email.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '<' | '>')) {
            return Err("Enter a valid author name and email.".to_owned());
        }
        Ok(format!("{name} <{email}>"))
    }).transpose()?;
    if request.amend {
        // Keep the replaced commit reachable even after reflog expiration.
        let reference = format!("refs/gitorbit/recovery/{}-amend-{}", git::now_ms(), &reviewed.head[..8]);
        run(git, repo, &["update-ref", &reference, &reviewed.head])?;
    }
    let mut args = vec!["commit"];
    if request.amend { args.push("--amend"); }
    if request.sign_off { args.push("--signoff"); }
    if let Some(author) = &author {args.extend(["--author", author]);}
    if let Some(sign) = request.sign {args.push(if sign {"--gpg-sign"} else {"--no-gpg-sign"});}
    args.extend(["-m", &request.message]);
    // Use Git's actual index, hooks and signing configuration. Never stage or push implicitly.
    run(git, repo, &args)?;
    let hash = text(git, repo, &["rev-parse", "--short", "HEAD"])?;
    Ok(format!("{} commit {hash}.", if request.amend { "Amended" } else { "Created" }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};
    fn fixture(initial: bool) -> (tempfile::TempDir, PathBuf) {
        let root = tempfile::tempdir().unwrap(); let (git, _) = git::find_git().unwrap();
        run(&git, root.path(), &["init", "-q", "-b", "main"]).unwrap();
        for args in [["config", "user.name", "Commit Test"], ["config", "user.email", "commit@example.com"], ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"]] {
            run(&git, root.path(), &args).unwrap();
        }
        if initial {
            fs::write(root.path().join("file.txt"), "base\n").unwrap();
            run(&git, root.path(), &["add", "file.txt"]).unwrap();
            run(&git, root.path(), &["commit", "-qm", "Original subject\n\nFull body"]).unwrap();
        }
        (root, git)
    }
    fn request(git: &Path, repo: &Path, amend: bool, sign_off: bool) -> Request {
        Request { review_token: info(git, repo).unwrap().review_token, message: "Reviewed subject\n\nReviewed body".into(), amend, sign_off, author: None, sign: None }
    }
    #[test]
    fn message_only_amend_preserves_tree_author_and_recovery() {
        let (root, git) = fixture(true); let repo = root.path();
        let before = info(&git, repo).unwrap();
        assert_eq!(before.previous_message, "Original subject\n\nFull body");
        let tree = text(&git, repo, &["rev-parse", "HEAD^{tree}"]).unwrap();
        let author = text(&git, repo, &["show", "-s", "--format=%an <%ae> %at", "HEAD"]).unwrap();
        fs::write(repo.join("file.txt"), "unstaged work\n").unwrap();
        commit(&git, repo, &request(&git, repo, true, false)).unwrap();
        assert_eq!(text(&git, repo, &["rev-list", "--count", "HEAD"]).unwrap(), "1");
        assert_eq!(text(&git, repo, &["rev-parse", "HEAD^{tree}"]).unwrap(), tree);
        assert_eq!(text(&git, repo, &["show", "-s", "--format=%an <%ae> %at", "HEAD"]).unwrap(), author);
        assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "unstaged work\n");
        assert!(git_tools::inspect(&git, repo).unwrap().refs.iter().any(|r| r.kind == "recovery" && r.hash == before.head));
    }
    #[test]
    fn signoff_commits_only_index_and_uses_git_identity() {
        let (root, git) = fixture(true); let repo = root.path();
        fs::write(repo.join("file.txt"), "staged work\n").unwrap();
        run(&git, repo, &["add", "file.txt"]).unwrap();
        fs::write(repo.join("file.txt"), "unstaged work\n").unwrap();
        let before = info(&git, repo).unwrap(); assert_eq!(before.sign_off_identity.as_deref(), Some("Commit Test <commit@example.com>"));
        commit(&git, repo, &request(&git, repo, false, true)).unwrap();
        assert!(info(&git, repo).unwrap().previous_message.ends_with("Signed-off-by: Commit Test <commit@example.com>"));
        assert_eq!(text(&git, repo, &["show", "HEAD:file.txt"]).unwrap(), "staged work");
        assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "unstaged work\n");
    }
    #[test]
    fn stale_reviews_cover_head_index_and_worktree() {
        let (root, git) = fixture(true); let repo = root.path();
        let reviewed = request(&git, repo, true, false);
        fs::write(repo.join("file.txt"), "edit\n").unwrap();
        assert!(commit(&git, repo, &reviewed).unwrap_err().contains("Repository changed"));
        let reviewed = request(&git, repo, true, false);
        run(&git, repo, &["add", "file.txt"]).unwrap();
        assert!(commit(&git, repo, &reviewed).unwrap_err().contains("Repository changed"));
        let reviewed = request(&git, repo, true, false);
        run(&git, repo, &["commit", "-qm", "External commit"]).unwrap();
        assert!(commit(&git, repo, &reviewed).unwrap_err().contains("Repository changed"));
    }
    #[test]
    fn amend_refuses_unborn_detached_and_pending_operations() {
        let (root, git) = fixture(false); let repo = root.path();
        assert!(!info(&git, repo).unwrap().can_amend);
        assert!(commit(&git, repo, &request(&git, repo, true, false)).unwrap_err().contains("initial commit"));
        fs::write(repo.join("file.txt"), "base\n").unwrap(); run(&git, repo, &["add", "file.txt"]).unwrap();
        commit(&git, repo, &request(&git, repo, false, false)).unwrap();
        run(&git, repo, &["checkout", "--detach", "-q"]).unwrap();
        assert!(commit(&git, repo, &request(&git, repo, true, false)).unwrap_err().contains("Select a branch"));
        run(&git, repo, &["checkout", "main", "-q"]).unwrap();
        for marker in ["MERGE_HEAD", "rebase-merge", "CHERRY_PICK_HEAD"] {
            let path = version_control::git_path(&git, repo, marker).unwrap();
            if marker == "rebase-merge" { fs::create_dir(&path).unwrap(); }
            else { fs::write(&path, format!("{}\n", info(&git, repo).unwrap().head)).unwrap(); }
            assert!(!info(&git, repo).unwrap().can_amend);
            assert!(commit(&git, repo, &request(&git, repo, true, false)).is_err());
            if path.is_dir() { fs::remove_dir(&path).unwrap(); } else { fs::remove_file(&path).unwrap(); }
        }
    }
    #[test]
    fn detects_published_history_without_pushing() {
        let (root, git) = fixture(true); let repo = root.path(); let head = info(&git, repo).unwrap().head;
        run(&git, repo, &["update-ref", "refs/remotes/origin/main", &head]).unwrap();
        assert!(info(&git, repo).unwrap().published);
        commit(&git, repo, &request(&git, repo, true, false)).unwrap();
        assert_eq!(text(&git, repo, &["rev-parse", "refs/remotes/origin/main"]).unwrap(), head);
    }
    #[test]
    fn staged_amend_preserves_unstaged_work_and_adds_signoff() {
        let (root, git) = fixture(true); let repo = root.path();
        fs::write(repo.join("file.txt"), "staged version\n").unwrap(); run(&git, repo, &["add", "file.txt"]).unwrap();
        fs::write(repo.join("file.txt"), "unstaged version\n").unwrap();
        commit(&git, repo, &request(&git, repo, true, true)).unwrap();
        assert_eq!(text(&git, repo, &["rev-list", "--count", "HEAD"]).unwrap(), "1");
        assert_eq!(text(&git, repo, &["show", "HEAD:file.txt"]).unwrap(), "staged version");
        assert_eq!(fs::read_to_string(repo.join("file.txt")).unwrap(), "unstaged version\n");
        assert!(info(&git, repo).unwrap().previous_message.contains("Signed-off-by: Commit Test <commit@example.com>"));
    }
    #[test]
    fn amend_refuses_conflicts_and_merge_commits() {
        let (root, git) = fixture(true); let repo = root.path();
        run(&git, repo, &["checkout", "-qb", "feature"]).unwrap();
        fs::write(repo.join("file.txt"), "feature\n").unwrap(); run(&git, repo, &["commit", "-qam", "Feature"]).unwrap();
        run(&git, repo, &["checkout", "-q", "main"]).unwrap();
        fs::write(repo.join("file.txt"), "main\n").unwrap(); run(&git, repo, &["commit", "-qam", "Main"]).unwrap();
        assert!(run(&git, repo, &["merge", "--no-edit", "feature"]).is_err());
        assert!(commit(&git, repo, &request(&git, repo, true, false)).is_err());
        fs::write(repo.join("file.txt"), "merged\n").unwrap(); run(&git, repo, &["add", "file.txt"]).unwrap();
        run(&git, repo, &["commit", "-qm", "Merge feature"]).unwrap();
        let state = info(&git, repo).unwrap();
        assert_eq!(state.blocked_reason.as_deref(), Some("Amending a merge commit is not supported."));
        assert!(commit(&git, repo, &request(&git, repo, true, false)).is_err());
    }
    #[test]
    fn commit_hooks_can_reject_amend_without_changing_head() {
        let (root, git) = fixture(true); let repo = root.path();
        let hooks = repo.join("test-hooks"); fs::create_dir(&hooks).unwrap();
        fs::write(hooks.join("pre-commit"), "#!/bin/sh\necho 'Rejected by test hook' >&2\nexit 1\n").unwrap();
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(hooks.join("pre-commit"), fs::Permissions::from_mode(0o755)).unwrap(); }
        run(&git, repo, &["config", "core.hooksPath", hooks.to_str().unwrap()]).unwrap();
        let before = info(&git, repo).unwrap().head;
        assert!(commit(&git, repo, &request(&git, repo, true, false)).unwrap_err().contains("Rejected by test hook"));
        assert_eq!(info(&git, repo).unwrap().head, before);
    }
    #[test]
    fn custom_author_is_explicit_and_does_not_change_signoff_committer() {
        let (root, git) = fixture(true); let repo = root.path();
        let state = info(&git, repo).unwrap();assert_eq!(state.default_author_name,"Commit Test");assert_eq!(state.previous_author_email,"commit@example.com");
        let mut r = request(&git, repo, true, true);r.author = Some(Author{name:"Co Author ' Name".into(),email:"coauthor@example.com".into()});
        commit(&git, repo, &r).unwrap();
        assert_eq!(text(&git, repo, &["show","-s","--format=%an <%ae>","HEAD"]).unwrap(),"Co Author ' Name <coauthor@example.com>");
        assert_eq!(text(&git, repo, &["show","-s","--format=%cn <%ce>","HEAD"]).unwrap(),"Commit Test <commit@example.com>");
        assert!(info(&git, repo).unwrap().previous_message.contains("Signed-off-by: Commit Test <commit@example.com>"));
    }
    #[test]
    fn author_validation_refuses_newlines_and_identity_injection() {
        let (root, git) = fixture(true);let repo=root.path();let before=info(&git,repo).unwrap().head;
        for (name,email) in [("Name\nInjected","valid@example.com"),("Name <Other>","valid@example.com"),("Name","bad@ address"),("Name","missing-at"),("Name","one@two@three"),("","valid@example.com")] {
            let mut r=request(&git,repo,true,false);r.author=Some(Author{name:name.into(),email:email.into()});
            assert!(commit(&git,repo,&r).unwrap_err().contains("valid author"));
        }
        assert_eq!(info(&git,repo).unwrap().head,before);
    }
    #[test]
    fn inherited_signing_is_displayed_and_per_commit_override_preserves_config() {
        let (root,git)=fixture(true);let repo=root.path();
        run(&git,repo,&["config","commit.gpgsign","true"]).unwrap();run(&git,repo,&["config","gpg.format","ssh"]).unwrap();
        run(&git,repo,&["config","user.signingkey","missing-test-signing-key"]).unwrap();
        let state=info(&git,repo).unwrap();assert!(state.signing_enabled);assert_eq!(state.signing_format,"ssh");assert_eq!(state.signing_key.as_deref(),Some("missing-test-signing-key"));
        let mut r=request(&git,repo,true,false);r.sign=Some(false);commit(&git,repo,&r).unwrap();
        assert_eq!(text(&git,repo,&["show","-s","--format=%G?","HEAD"]).unwrap(),"N");
        assert!(info(&git,repo).unwrap().signing_enabled);
        let before=info(&git,repo).unwrap().head;let mut r=request(&git,repo,true,false);r.sign=Some(true);
        assert!(commit(&git,repo,&r).is_err());assert_eq!(info(&git,repo).unwrap().head,before);
    }
}
