use crate::{git::{capture, git_command}, version_control};
use command_group::CommandGroup;
use serde::Serialize;
use std::{collections::HashMap, path::{Path, PathBuf}, process::{Command, Stdio}, sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex}, thread, time::{Duration, Instant}};
use url::Url;

pub const SETUP_URL: &str = "https://github.com/git-ecosystem/git-credential-manager/blob/main/docs/install.md";
const CANCELLED: &str = "Sign-in cancelled. You can try again.";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthenticationInfo {
    pub target: String,
    pub host: String,
    pub can_sign_in: bool,
    pub reason: Option<String>,
}

type Session = (PathBuf, Arc<AtomicBool>, Instant, bool);
#[derive(Default)]
pub struct AuthSessions(Mutex<HashMap<String, Session>>);
impl AuthSessions {
    fn access(&self, id: &str, repo: &Path, cancel: bool) -> Result<Arc<AtomicBool>, String> {
        if id.len() != 36 || !id.bytes().all(|byte| byte.is_ascii_hexdigit() || byte == b'-') { return Err("Invalid sign-in session.".into()); }
        let mut sessions = self.0.lock().map_err(|_| "Could not manage sign-in.")?;
        sessions.retain(|_, (_, cancelled, created, _)| !cancelled.load(Ordering::SeqCst) || created.elapsed() < Duration::from_secs(10));
        if !sessions.contains_key(id) && sessions.len() >= 32 { return Err("Another sign-in is in progress.".into()); }
        let (path, flag, _, started) = sessions.entry(id.into()).or_insert_with(|| (repo.to_owned(), Arc::new(AtomicBool::new(false)), Instant::now(), false));
        if path != repo { return Err("Invalid sign-in session.".into()); }
        if cancel { flag.store(true, Ordering::SeqCst); }
        else if *started { return Err("Another sign-in is in progress.".into()); }
        else { *started = true; }
        Ok(flag.clone())
    }
    pub fn begin(&self, id: &str, repo: &Path) -> Result<Arc<AtomicBool>, String> { self.access(id, repo, false) }
    pub fn cancel(&self, id: &str, repo: &Path) -> Result<(), String> { self.access(id, repo, true).map(|_| ()) }
    pub fn finish(&self, id: &str) { if let Ok(mut sessions) = self.0.lock() { sessions.remove(id); } }
}

fn read(git: &Path, repo: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut command = git_command(git, repo); command.args(args);
    capture(command, Duration::from_secs(10))
}

fn https_target(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "Use HTTPS with Git Credential Manager, or configure your SSH key and retry.")?;
    if url.scheme() != "https" || url.host_str().is_none() { return Err("Use HTTPS with Git Credential Manager, or configure your SSH key and retry.".into()); }
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("Remove embedded credentials from the remote URL before signing in.".into());
    }
    Ok(url)
}

fn push_target(git: &Path, repo: &Path, remote: &str) -> Result<Url, String> {
    let bytes = read(git, repo, &["remote", "get-url", "--push", "--all", remote])?;
    let urls: Vec<_> = String::from_utf8_lossy(&bytes).lines().map(str::to_owned).collect();
    if urls.len() != 1 { return Err("Sign in to each push destination using Git, then retry.".into()); }
    https_target(&urls[0])
}

fn configured_manager(git: &Path, repo: &Path, target: &Url) -> Option<&'static str> {
    // Respect URL-scoped helper configuration, including reset entries. Do not
    // enable unknown helpers or silently replace the user's Git configuration.
    let bytes = read(git, repo, &["config", "--get-urlmatch", "credential.helper", target.as_str()]).ok()?;
    let helpers = String::from_utf8_lossy(&bytes);
    let effective: Vec<_> = helpers.lines().rev().take_while(|line| !line.is_empty()).collect();
    for manager in ["manager", "manager-core"] {
        if effective.contains(&manager) {
            let executable = format!("credential-{manager}");
            if read(git, repo, &[&executable, "--version"]).is_ok() { return Some(manager); }
        }
    }
    None
}

pub fn info(git: &Path, repo: &Path) -> Result<AuthenticationInfo, String> {
    let (_, _, _, _, remote, _) = version_control::read_upstream(git, repo)?;
    let target = match push_target(git, repo, &remote) {
        Ok(url) => url,
        Err(reason) => return Ok(AuthenticationInfo { target: String::new(), host: String::new(), can_sign_in: false, reason: Some(reason) }),
    };
    let can_sign_in = configured_manager(git, repo, &target).is_some();
    Ok(AuthenticationInfo { host: target.origin().ascii_serialization(), target: target.into(), can_sign_in, reason: if can_sign_in { None } else { Some("Install and configure Git Credential Manager, then refresh this page.".into()) } })
}

fn interactive_command(git: &Path, repo: &Path, manager: &str, url: &Url, refspec: &str) -> Command {
    let mut command = git_command(git, repo);
    // Reset other helpers only for this command so no plaintext helper receives
    // the credentials. The selected manager uses the platform's secure store.
    command.args(["-c", "credential.helper=", "-c", &format!("credential.helper={manager}"), "push", "--dry-run", "--porcelain", url.as_str(), refspec]);
    command.env("GCM_INTERACTIVE", "true").env("GCM_GUI_PROMPT", "true")
        .env("GCM_CREDENTIAL_STORE", if cfg!(windows) { "wincredman" } else if cfg!(target_os = "macos") { "keychain" } else { "secretservice" })
        .env("GCM_TRACE", "0").env("GCM_TRACE_SECRETS", "0")
        .env_remove("GIT_TRACE").env_remove("GIT_TRACE_CURL").env_remove("GIT_CURL_VERBOSE")
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    command
}

fn wait_for_sign_in(mut command: Command, cancelled: &AtomicBool, timeout: Duration) -> Result<(), String> {
    if cancelled.load(Ordering::SeqCst) { return Err(CANCELLED.into()); }
    let mut child = command.group_spawn().map_err(|_| "Could not open Git sign-in. Check Git Credential Manager setup.")?;
    let started = Instant::now();
    loop {
        if cancelled.load(Ordering::SeqCst) || started.elapsed() >= timeout {
            let _ = child.kill(); let _ = child.wait();
            return Err(if cancelled.load(Ordering::SeqCst) { CANCELLED } else { "Sign-in timed out. You can try again." }.into());
        }
        match child.try_wait() {
            Ok(Some(status)) => return if status.success() { Ok(()) } else { Err("Sign-in was not completed. Check your account, access token, and repository permissions, then try again.".into()) },
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(_) => { let _ = child.kill(); let _ = child.wait(); return Err("Could not complete Git sign-in.".into()); }
        }
    }
}

pub fn sign_in(git: &Path, repo: &Path, expected_target: &str, expected_head: &str, expected_upstream_head: &str, cancelled: &AtomicBool) -> Result<(), String> {
    if cancelled.load(Ordering::SeqCst) { return Err(CANCELLED.into()); }
    let plan = version_control::push_plan(git, repo, expected_head, expected_upstream_head)?;
    let url = push_target(git, repo, &plan.remote)?;
    if url.as_str() != expected_target { return Err("The push destination changed. Refresh before signing in.".into()); }
    let manager = configured_manager(git, repo, &url).ok_or("Install and configure Git Credential Manager, then refresh this page.")?;
    // Git receive-pack checks push authentication. Dry-run never updates refs
    // or sends the pending commits; the actual push remains an explicit click.
    wait_for_sign_in(interactive_command(git, repo, manager, &url, &plan.refspec), cancelled, Duration::from_secs(180))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::{command, find_git};
    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let root = tempfile::tempdir().unwrap(); let (git, _) = find_git().unwrap();
        for args in [vec!["init", "-q", "-b", "main"], vec!["config", "user.name", "Demo"], vec!["config", "user.email", "demo@example.com"], vec!["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", "Initial"], vec!["remote", "add", "origin", "https://git.example.invalid/team/repo.git"], vec!["update-ref", "refs/remotes/origin/main", "HEAD"], vec!["branch", "--set-upstream-to", "origin/main"], vec!["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", "Outgoing"]] { read(&git, root.path(), &args).unwrap(); }
        (root, git)
    }
    #[test]
    fn sign_in_target_is_push_url_and_never_exposes_embedded_secrets() {
        let (root, git) = fixture();
        read(&git, root.path(), &["remote", "set-url", "--push", "origin", "https://push.example.invalid/team/repo.git"]).unwrap();
        let metadata = info(&git, root.path()).unwrap();
        assert_eq!(metadata.host, "https://push.example.invalid");
        assert_eq!(metadata.target, "https://push.example.invalid/team/repo.git");
        for raw in ["http://git.example.invalid/repo", "ssh://git@git.example.invalid/repo", "git@git.example.invalid:repo", "https://user:fixture-secret@git.example.invalid/repo", "https://git.example.invalid/repo?token=fixture-secret"] { assert!(https_target(raw).is_err()); }
        read(&git, root.path(), &["remote", "set-url", "--push", "origin", "https://user:fixture-secret@git.example.invalid/repo"]).unwrap();
        let result = serde_json::to_string(&info(&git, root.path()).unwrap()).unwrap();
        assert!(!result.contains("fixture-secret") && !result.contains("user:"));
    }
    #[test]
    fn sign_in_checks_reviewed_heads_target_and_cancel_before_network() {
        let (root, git) = fixture(); let outgoing = version_control::outgoing(&git, root.path()).unwrap();
        let no = AtomicBool::new(false);
        assert!(sign_in(&git, root.path(), "https://other.example.invalid/repo", &outgoing.head, &outgoing.upstream_head, &no).unwrap_err().contains("destination changed"));
        assert!(sign_in(&git, root.path(), "https://git.example.invalid/team/repo.git", &outgoing.upstream_head, &outgoing.upstream_head, &no).unwrap_err().contains("branch changed"));
        assert_eq!(sign_in(&git, root.path(), "", "", "", &AtomicBool::new(true)).unwrap_err(), CANCELLED);
        read(&git, root.path(), &["config", "--local", "credential.helper", ""]).unwrap();
        assert!(!info(&git, root.path()).unwrap().can_sign_in);
        assert_eq!(version_control::outgoing(&git, root.path()).unwrap().head, outgoing.head);
    }
    #[test]
    fn interactive_login_is_dry_run_gui_only_and_uses_secure_store() {
        let cmd = interactive_command(Path::new("git"), Path::new("repo"), "manager", &Url::parse("https://git.example.invalid/repo").unwrap(), "HEAD:refs/heads/main");
        let args: Vec<_> = cmd.get_args().map(|arg| arg.to_string_lossy().into_owned()).collect();
        assert!(args.contains(&"--dry-run".into()) && args.contains(&"credential.helper=".into()) && args.contains(&"credential.helper=manager".into()));
        let envs: HashMap<_, _> = cmd.get_envs().map(|(key, value)| (key.to_string_lossy().into_owned(), value.map(|value| value.to_string_lossy().into_owned()))).collect();
        assert_eq!(envs.get("GCM_INTERACTIVE"), Some(&Some("true".into())));
        assert_eq!(envs.get("GIT_TERMINAL_PROMPT"), Some(&Some("0".into())));
        assert_eq!(envs.get("GCM_TRACE_SECRETS"), Some(&Some("0".into())));
        assert_ne!(envs.get("GCM_CREDENTIAL_STORE"), Some(&Some("plaintext".into())));
        let background = git_command(Path::new("git"), Path::new("repo"));
        assert!(background.get_envs().any(|(key, value)| key == "GCM_INTERACTIVE" && value == Some(std::ffi::OsStr::new("Never"))));
    }
    fn sleeper() -> Command {
        if cfg!(windows) { let mut cmd = command("cmd.exe"); cmd.args(["/C", "ping -n 20 127.0.0.1 > nul"]); cmd }
        else { let mut cmd = command("sh"); cmd.args(["-c", "sleep 20 & wait"]); cmd }
    }
    #[test]
    fn cancellation_and_timeout_stop_process_groups_without_hanging() {
        let started = Instant::now();
        assert!(wait_for_sign_in(sleeper(), &AtomicBool::new(false), Duration::from_millis(80)).unwrap_err().contains("timed out"));
        let flag = Arc::new(AtomicBool::new(false)); let cancel = flag.clone();
        let worker = thread::spawn(move || { thread::sleep(Duration::from_millis(80)); cancel.store(true, Ordering::SeqCst); });
        assert_eq!(wait_for_sign_in(sleeper(), &flag, Duration::from_secs(5)).unwrap_err(), CANCELLED);
        worker.join().unwrap(); assert!(started.elapsed() < Duration::from_secs(5));
    }
    #[test]
    fn cancellation_sessions_are_scoped_and_accept_early_cancellation() {
        let sessions = AuthSessions::default(); let id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"; let repo = Path::new("repo");
        sessions.cancel(id, repo).unwrap();
        let flag = sessions.begin(id, repo).unwrap(); assert!(flag.load(Ordering::SeqCst));
        assert!(sessions.begin(id, repo).is_err());
        assert!(sessions.cancel(id, Path::new("other-repo")).is_err());
        sessions.finish(id);
        assert!(!sessions.begin(id, repo).unwrap().load(Ordering::SeqCst));
        assert!(sessions.begin("bad-session", repo).is_err());
    }
}
