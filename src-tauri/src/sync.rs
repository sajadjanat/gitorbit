use crate::version_control::{self, git_path, run, OutgoingCommit};
use serde::Serialize;
use std::{fs, hash::{Hash, Hasher}, path::Path};

pub const REMOTE_CHANGED: &str = "The remote changed. Check incoming commits and sync before pushing.";
pub fn is_rejection(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    error.contains("non-fast-forward") || error.contains("fetch first") || error.contains("remote contains work") || error.contains("tip of your current branch is behind")
}
fn urls(git: &Path, repo: &Path, remote: &str, push: bool) -> Result<Vec<String>, String> {
    let args = if push { vec!["remote", "get-url", "--push", "--all", remote] } else { vec!["remote", "get-url", "--all", remote] };
    Ok(String::from_utf8_lossy(&run(git, repo, &args)?).lines().map(str::to_owned).collect())
}
pub fn remote_head(git: &Path, repo: &Path, remote: &str, branch: &str) -> Result<String, String> {
    let urls = urls(git, repo, remote, true)?;
    if urls.len() != 1 { return Err("This remote has multiple push destinations. Sync each destination using Git.".into()); }
    let reference = format!("refs/heads/{branch}");
    let bytes = run(git, repo, &["ls-remote", "--exit-code", "--heads", "--", &urls[0], &reference])?;
    String::from_utf8_lossy(&bytes).lines().find_map(|line| {
        let (hash, name) = line.split_once('\t')?;
        (name == reference && matches!(hash.len(), 40 | 64) && hash.bytes().all(|b| b.is_ascii_hexdigit())).then(|| hash.to_owned())
    }).ok_or("The push destination could not be verified. Check the remote branch using Git.".into())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pub review_token: String,
    pub head: String, pub upstream_head: String, pub source_branch: String,
    pub remote: String, pub destination_branch: String,
    pub ahead: u64, pub behind: u64, pub dirty: usize, pub conflicts: usize,
    pub operation: Option<String>, pub merge_head: Option<String>,
    pub blocked_reason: Option<String>, pub incoming: Vec<OutgoingCommit>, pub note: Option<String>,
}
pub fn check(git: &Path, repo: &Path, fetch: bool) -> Result<SyncState, String> {
    let (_, _, _, upstream, remote, destination) = version_control::read_upstream(git, repo)?;
    let fetch_urls = urls(git, repo, &remote, false)?;
    let push_urls = urls(git, repo, &remote, true)?;
    let blocked_reason = if fetch_urls.len() != 1 || push_urls != fetch_urls {
        Some("Push and fetch destinations differ. Sync the push destination using Git, then retry.".into())
    } else { None };
    if fetch && blocked_reason.is_none() {
        let refspec = format!("+refs/heads/{destination}:{upstream}");
        run(git, repo, &["fetch", "--no-tags", "--", &remote, &refspec])?;
    }
    let (head, upstream_head, source_branch, upstream_ref, remote, destination_branch) = version_control::read_upstream(git, repo)?;
    // Opaque identity for stale-review checks, including branch/config changes
    // at the same SHA. Remote URLs (which may contain credentials) stay native.
    let mut identity = std::collections::hash_map::DefaultHasher::new();
    (&source_branch, &upstream_ref, &remote, &destination_branch, &fetch_urls, &push_urls).hash(&mut identity);
    let review_token = format!("{:016x}", identity.finish());
    let state = version_control::changes(git, repo)?;
    let merge_head = fs::read_to_string(git_path(git, repo, "MERGE_HEAD")?).ok().map(|s| s.trim().to_owned());
    let operation = version_control::pending_operation(git, repo)?.map(str::to_owned);
    let behind = state.behind.unwrap_or(0);
    let incoming = if behind > 0 {
        let range = format!("{head}..{upstream_head}");
        version_control::parse_outgoing_log(&run(git, repo, &["log", "--topo-order", "--no-color", "--encoding=UTF-8", "--max-count=25", "--format=%x1e%H%x00%an%x00%at%x00%s", &range])?)?
    } else { vec![] };
    let blocked_reason = blocked_reason.or_else(|| if run(git, repo, &["merge-base", &head, &upstream_head]).is_err() { Some("These branches have no common ancestor. Review them using Git before syncing.".into()) } else { None });
    Ok(SyncState {review_token, head, upstream_head, source_branch, remote, destination_branch, ahead:state.ahead.unwrap_or(0), behind, dirty:state.changed, conflicts:state.conflicts, operation, merge_head, blocked_reason, incoming, note:None})
}
pub fn integrate(git: &Path, repo: &Path, expected_head: &str, expected_upstream: &str, expected_token: &str) -> Result<SyncState, String> {
    let state = check(git, repo, false)?;
    if state.head != expected_head || state.upstream_head != expected_upstream || state.review_token != expected_token { return Err("The branch or incoming commits changed. Fetch and review again before syncing.".into()); }
    if let Some(reason) = state.blocked_reason { return Err(reason); }
    if state.operation.is_some() { return Err("A Git operation is already in progress. Finish it before syncing.".into()); }
    if state.dirty > 0 { return Err("Commit or stash local file changes before syncing. Your commits are preserved.".into()); }
    if state.behind == 0 { return Ok(state); }
    let flag = if state.ahead > 0 { "--no-ff" } else { "--ff-only" };
    // Merge the reviewed SHA, never a moving ref; both sides' IDs survive.
    let result = run(git, repo, &["merge", flag, "--no-edit", &state.upstream_head]);
    let mut after = check(git, repo, false)?;
    if let Err(error) = result {
        if after.operation.is_none() { return Err(error); }
        after.note = Some(error);
    }
    Ok(after)
}
pub fn abort(git: &Path, repo: &Path, expected_head: &str, expected_merge: &str, expected_token: &str) -> Result<SyncState, String> {
    let state = check(git, repo, false)?;
    if state.head != expected_head || state.merge_head.as_deref() != Some(expected_merge) || state.review_token != expected_token { return Err("The merge changed. Refresh before cancelling it.".into()); }
    run(git, repo, &["merge", "--abort"])?;
    check(git, repo, false)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use super::*;
    use crate::git::find_git;
    fn exec(git: &Path, repo: &Path, args: &[&str]) { run(git, repo, args).unwrap(); }
    fn hash(git: &Path, repo: &Path, reference: &str) -> String { String::from_utf8_lossy(&run(git, repo, &["rev-parse", reference]).unwrap()).trim().to_owned() }
    fn commit(git: &Path, repo: &Path, file: &str, text: &str) { fs::write(repo.join(file), text).unwrap(); exec(git, repo, &["add", "--", file]); exec(git, repo, &["commit", "-qm", file]); }
    fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf, PathBuf, PathBuf) {
        let root = tempfile::tempdir().unwrap(); let (git, _) = find_git().unwrap();
        let local = root.path().join("local"); let remote = root.path().join("remote.git"); let peer = root.path().join("peer");
        fs::create_dir(&local).unwrap(); exec(&git, &local, &["init", "-qb", "main"]);
        exec(&git, root.path(), &["init", "--bare", "-q", remote.to_str().unwrap()]);
        for args in [["config", "user.name", "Demo"], ["config", "user.email", "demo@example.com"], ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"]] { exec(&git, &local, &args); }
        commit(&git, &local, "base.txt", "base\n"); exec(&git, &local, &["remote", "add", "origin", remote.to_str().unwrap()]); exec(&git, &local, &["push", "-qu", "origin", "HEAD:published"]);
        exec(&git, root.path(), &["clone", "-q", "-b", "published", remote.to_str().unwrap(), peer.to_str().unwrap()]);
        for args in [["config", "user.name", "Demo"], ["config", "user.email", "demo@example.com"], ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"]] { exec(&git, &peer, &args); }
        (root, git, local, remote, peer)
    }
    #[test]
    fn stale_remote_is_detected_before_push_and_merge_preserves_both_sides() {
        let (_root, git, local, remote, peer) = fixture();
        commit(&git, &local, "ours.txt", "local\n"); let preview = version_control::outgoing(&git, &local).unwrap();
        commit(&git, &peer, "theirs.txt", "remote\n"); exec(&git, &peer, &["push", "-q"]); let incoming = hash(&git, &peer, "HEAD");
        assert_eq!(version_control::push(&git, &local, &preview.head, &preview.upstream_head).unwrap_err(), REMOTE_CHANGED);
        assert_eq!(hash(&git, &remote, "published"), incoming); assert_eq!(hash(&git, &local, "HEAD"), preview.head);
        let state = check(&git, &local, true).unwrap(); assert_eq!((state.ahead, state.behind), (1,1)); assert_eq!(state.incoming.len(),1);
        assert!(integrate(&git, &local, &state.upstream_head, &state.upstream_head, &state.review_token).is_err());
        let merged = integrate(&git, &local, &state.head, &state.upstream_head, &state.review_token).unwrap(); assert_eq!(merged.behind,0); assert!(merged.operation.is_none());
        exec(&git, &local, &["merge-base", "--is-ancestor", &preview.head, "HEAD"]); exec(&git, &local, &["merge-base", "--is-ancestor", &incoming, "HEAD"]);
        assert_eq!(fs::read_to_string(local.join("ours.txt")).unwrap(), "local\n"); assert_eq!(fs::read_to_string(local.join("theirs.txt")).unwrap(), "remote\n");
        let reviewed = version_control::outgoing(&git, &local).unwrap(); assert_eq!(reviewed.total_commits,2);
        version_control::push(&git, &local, &reviewed.head, &reviewed.upstream_head).unwrap(); assert_eq!(hash(&git, &remote, "published"), merged.head);
    }
    #[test]
    fn behind_only_fast_forwards_to_reviewed_commit() {
        let (_root, git, local, _remote, peer) = fixture(); commit(&git, &peer, "incoming.txt", "incoming\n"); exec(&git, &peer, &["push", "-q"]);
        let state = check(&git, &local, true).unwrap(); assert_eq!((state.ahead,state.behind),(0,1));
        let updated = integrate(&git, &local, &state.head, &state.upstream_head, &state.review_token).unwrap(); assert_eq!(updated.head,state.upstream_head); assert_eq!(updated.behind,0);
    }
    #[test]
    fn switching_branch_or_destination_at_same_sha_invalidates_review() {
        let (_root, git, local, remote, peer) = fixture();
        commit(&git, &peer, "incoming.txt", "incoming\n"); exec(&git, &peer, &["push", "-q"]);
        let reviewed = check(&git, &local, true).unwrap();
        exec(&git, &local, &["checkout", "-qb", "other"]);
        exec(&git, &local, &["branch", "--set-upstream-to", "origin/published"]);
        assert_eq!(hash(&git, &local, "HEAD"), reviewed.head);
        assert!(integrate(&git, &local, &reviewed.head, &reviewed.upstream_head, &reviewed.review_token).is_err());
        exec(&git, &local, &["checkout", "-q", "main"]);
        let head = hash(&git, &remote, "published");
        exec(&git, &remote, &["update-ref", "refs/heads/alternate", &head]);
        exec(&git, &local, &["fetch", "-q", "origin"]);
        exec(&git, &local, &["branch", "--set-upstream-to", "origin/alternate"]);
        assert!(integrate(&git, &local, &reviewed.head, &reviewed.upstream_head, &reviewed.review_token).is_err());
        assert_eq!(hash(&git, &local, "HEAD"), reviewed.head);
    }
    #[test]
    fn conflicts_are_visible_and_explicit_abort_restores_local_commit() {
        let (_root, git, local, remote, peer) = fixture(); commit(&git, &local, "base.txt", "ours\n"); commit(&git, &peer, "base.txt", "theirs\n"); exec(&git, &peer, &["push", "-q"]);
        let state = check(&git, &local, true).unwrap(); let conflict = integrate(&git, &local, &state.head, &state.upstream_head, &state.review_token).unwrap();
        assert_eq!(conflict.operation.as_deref(),Some("merge")); assert_eq!(conflict.conflicts,1); assert_eq!(conflict.head,state.head); assert!(conflict.note.is_some());
        assert!(integrate(&git, &local, &state.head, &state.upstream_head, &state.review_token).err().unwrap().contains("already in progress"));
        assert!(abort(&git, &local, &state.upstream_head, &state.upstream_head, &state.review_token).is_err());
        fs::write(local.join("base.txt"), "partial resolution\n").unwrap(); fs::write(local.join("keep.txt"), "untracked\n").unwrap();
        let restored = abort(&git, &local, &state.head, &state.upstream_head, &state.review_token).unwrap(); assert!(restored.operation.is_none()); assert_eq!(restored.head,state.head);
        assert_eq!(fs::read_to_string(local.join("base.txt")).unwrap(),"ours\n"); assert_eq!(fs::read_to_string(local.join("keep.txt")).unwrap(),"untracked\n"); assert_eq!(hash(&git,&remote,"published"),state.upstream_head);
    }
    #[test]
    fn conflicts_can_be_resolved_staged_and_committed_through_version_control() {
        let (_root, git, local, remote, peer) = fixture();
        commit(&git, &local, "base.txt", "ours\n"); commit(&git, &peer, "base.txt", "theirs\n"); exec(&git, &peer, &["push", "-q"]);
        let state = check(&git, &local, true).unwrap();
        let conflict = integrate(&git, &local, &state.head, &state.upstream_head, &state.review_token).unwrap();
        assert_eq!(conflict.conflicts, 1);
        assert!(version_control::action(&git, &local, "commit", &[], Some("Resolve merge")).is_err());
        fs::write(local.join("base.txt"), "ours and theirs\n").unwrap();
        version_control::action(&git, &local, "stage", &["base.txt".into()], None).unwrap();
        version_control::action(&git, &local, "commit", &[], Some("Resolve merge")).unwrap();
        let resolved = check(&git, &local, false).unwrap(); assert_eq!(resolved.conflicts, 0); assert_eq!(resolved.behind, 0); assert!(resolved.operation.is_none());
        exec(&git, &local, &["merge-base", "--is-ancestor", &state.head, "HEAD"]); exec(&git, &local, &["merge-base", "--is-ancestor", &state.upstream_head, "HEAD"]);
        let reviewed = version_control::outgoing(&git, &local).unwrap();
        version_control::push(&git, &local, &reviewed.head, &reviewed.upstream_head).unwrap();
        assert_eq!(hash(&git, &remote, "published"), resolved.head);
    }
    #[test]
    fn staged_unstaged_and_untracked_changes_block_sync_without_discarding_files() {
        let (_root, git, local, _remote, peer) = fixture(); commit(&git, &peer, "incoming.txt", "incoming\n"); exec(&git, &peer, &["push", "-q"]);
        fs::write(local.join("base.txt"),"staged\n").unwrap(); exec(&git,&local,&["add","base.txt"]); fs::write(local.join("base.txt"),"unstaged\n").unwrap(); fs::write(local.join("private.txt"),"keep\n").unwrap();
        let index=run(&git,&local,&["diff","--cached"]).unwrap(); let state=check(&git,&local,true).unwrap();
        assert!(integrate(&git, &local, &state.head, &state.upstream_head, &state.review_token).err().unwrap().contains("Commit or stash"));
        assert_eq!(run(&git,&local,&["diff","--cached"]).unwrap(),index); assert_eq!(fs::read_to_string(local.join("base.txt")).unwrap(),"unstaged\n"); assert_eq!(fs::read_to_string(local.join("private.txt")).unwrap(),"keep\n"); assert_eq!(hash(&git,&local,"HEAD"),state.head);
    }
    #[test]
    fn distinct_push_url_and_unrelated_history_are_not_silently_integrated() {
        let (root, git, local, remote, peer)=fixture(); let initial=hash(&git,&local,"@{upstream}"); let other=root.path().join("other.git");
        exec(&git,root.path(),&["clone","--bare","-q",remote.to_str().unwrap(),other.to_str().unwrap()]); commit(&git,&peer,"incoming.txt","remote\n"); exec(&git,&peer,&["push","-q"]);
        exec(&git,&local,&["remote","set-url","--push","origin",other.to_str().unwrap()]);
        let blocked=check(&git,&local,true).unwrap(); assert!(blocked.blocked_reason.unwrap().contains("destinations differ")); assert_eq!(hash(&git,&local,"@{upstream}"),initial); assert_eq!(remote_head(&git,&local,"origin","published").unwrap(),initial);
        exec(&git,&local,&["remote","set-url","--push","origin",remote.to_str().unwrap()]);
        exec(&git,&peer,&["checkout","--orphan","unrelated"]); exec(&git,&peer,&["rm","-rf","."]); commit(&git,&peer,"fresh.txt","fresh\n"); exec(&git,&peer,&["push","-q","--force","origin","HEAD:published"]);
        let unrelated=check(&git,&local,true).unwrap(); assert!(unrelated.blocked_reason.unwrap().contains("no common ancestor")); assert!(integrate(&git,&local,&unrelated.head,&unrelated.upstream_head,&unrelated.review_token).is_err()); assert_eq!(hash(&git,&local,"HEAD"),initial);
    }
}
