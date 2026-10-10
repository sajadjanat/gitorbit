use crate::{git_tools, version_control::run};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub name: String, pub fetch_urls: Vec<String>, pub push_urls: Vec<String>,
    pub push_url_configured: bool, pub has_credentials: bool, pub multiple_urls: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotesState { pub review_token: String, pub remotes: Vec<Remote> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRequest {
    pub action: String, pub target: String, pub name: String,
    pub fetch_url: String, pub push_url: String, pub review_token: String,
}
const FAILURE: &str = "Could not update remote configuration. Refresh and try again.";
const CREDENTIALS: &str = "Use a repository URL without passwords, tokens, query parameters, or fragments. Sign in using the credential manager.";
fn config(git: &Path, repo: &Path, name: &str, field: &str) -> Vec<String> {
    run(git, repo, &["config", "--local", "--get-all", &format!("remote.{name}.{field}")]).map(|b| String::from_utf8_lossy(&b).lines().map(str::to_owned).collect()).unwrap_or_default()
}
fn valid_name(git: &Path, repo: &Path, name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 100 || !name.bytes().next().is_some_and(|c| c.is_ascii_alphanumeric()) || !name.bytes().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c)) {
        return Err("Use a remote name containing letters, numbers, dots, underscores, or hyphens.".into());
    }
    run(git, repo, &["check-ref-format", &format!("refs/remotes/{name}/check")]).map(|_| ()).map_err(|_| "Enter a valid remote name.".into())
}
pub(crate) fn validate_url(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 4096 || value.starts_with('-') || value.chars().any(|c| c.is_control()) || value.contains("::") { return Err("Enter a valid repository URL or absolute local path.".into()); }
    if value.contains("://") {
        let url = url::Url::parse(value).map_err(|_| "Enter a valid repository URL or absolute local path.")?;
        if !["https", "http", "ssh", "git", "file"].contains(&url.scheme()) { return Err("Enter a valid repository URL or absolute local path.".into()); }
        if url.password().is_some() || (!["ssh"].contains(&url.scheme()) && !url.username().is_empty()) || url.query().is_some() || url.fragment().is_some() { return Err(CREDENTIALS.into()); }
        if url.scheme() != "file" && url.host_str().is_none() { return Err("Enter a valid repository URL or absolute local path.".into()); }
        return Ok(());
    }
    if Path::new(value).is_absolute() || (value.len() > 2 && value.as_bytes()[1] == b':' && matches!(value.as_bytes()[2], b'/' | b'\\')) { return Ok(()); }
    // SCP-style SSH: a single optional username and a nonempty host/path.
    if let Some((host, path)) = value.split_once(':') {
        let components: Vec<_> = host.split('@').collect();
        if components.len() <= 2 && !host.is_empty() && !path.is_empty() && components.iter().all(|p| !p.is_empty() && p.bytes().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))) && !value.contains(['?', '#']) { return Ok(()); }
    }
    Err("Enter a valid repository URL or absolute local path.".into())
}
fn display_url(value: &str) -> (String, bool) {
    if value.contains("://") {
        if let Ok(mut parsed) = url::Url::parse(value) {
            let sensitive = parsed.password().is_some() || (parsed.scheme() != "ssh" && !parsed.username().is_empty()) || parsed.query().is_some() || parsed.fragment().is_some();
            if sensitive {
                let _ = parsed.set_username(""); let _ = parsed.set_password(None);
                parsed.set_query(None); parsed.set_fragment(None);
            }
            return (parsed.to_string(), sensitive);
        }
        return ("[redacted URL]".into(), true);
    }
    if validate_url(value).is_ok() { (value.into(), false) } else { ("[redacted URL]".into(), true) }
}
pub fn inspect(git: &Path, repo: &Path) -> Result<RemotesState, String> {
    let state = git_tools::inspect(git, repo).map_err(|_| "Could not read remote configuration.")?;
    let remotes = state.remotes.iter().map(|name| {
        let fetch = config(git, repo, name, "url"); let push = config(git, repo, name, "pushurl");
        let configured = !push.is_empty(); let multi = fetch.len() > 1 || push.len() > 1;
        let fetch: Vec<_> = fetch.iter().map(|s| display_url(s)).collect();
        let push: Vec<_> = if configured { push.iter().map(|s| display_url(s)).collect() } else { fetch.clone() };
        let sensitive = fetch.iter().chain(push.iter()).any(|(_, s)| *s);
        Remote { name: name.clone(), fetch_urls: fetch.into_iter().map(|(s,_)| s).collect(), push_urls: push.into_iter().map(|(s,_)| s).collect(), push_url_configured: configured, has_credentials: sensitive, multiple_urls: multi }
    }).collect();
    Ok(RemotesState { review_token: state.review_token, remotes })
}
pub fn execute(git: &Path, repo: &Path, request: &RemoteRequest) -> Result<String, String> {
    let state = git_tools::inspect(git, repo).map_err(|_| FAILURE)?;
    if request.review_token != state.review_token { return Err("Repository changed. Refresh and review the operation again.".into()); }
    if state.operation.is_some() { return Err("Finish or abort the current Git operation first.".into()); }
    if !matches!(request.action.as_str(), "add" | "edit" | "rename" | "remove") { return Err("Unsupported remote operation.".into()); }
    if request.action != "add" && !state.remotes.contains(&request.target) { return Err("This remote no longer exists. Refresh and try again.".into()); }
    if matches!(request.action.as_str(), "add" | "rename") {
        valid_name(git, repo, &request.name)?;
        if state.remotes.contains(&request.name) { return Err("A remote with this name already exists.".into()); }
    }
    if matches!(request.action.as_str(), "add" | "edit") {
        validate_url(&request.fetch_url)?;
        if !request.push_url.is_empty() { validate_url(&request.push_url)?; }
    }
    match request.action.as_str() {
        "add" => {
            run(git, repo, &["remote", "add", "--", &request.name, &request.fetch_url]).map_err(|_| FAILURE)?;
            if !request.push_url.is_empty() { run(git, repo, &["config", "--local", &format!("remote.{}.pushurl", request.name), &request.push_url]).map_err(|_| FAILURE)?; }
        }
        "edit" => {
            if config(git, repo, &request.target, "url").len() > 1 || config(git, repo, &request.target, "pushurl").len() > 1 { return Err("This remote has multiple URLs. Edit it using Git to preserve every destination.".into()); }
            run(git, repo, &["config", "--local", &format!("remote.{}.url", request.target), &request.fetch_url]).map_err(|_| FAILURE)?;
            if request.push_url.is_empty() {
                if !config(git, repo, &request.target, "pushurl").is_empty() { run(git, repo, &["config", "--local", "--unset-all", &format!("remote.{}.pushurl", request.target)]).map_err(|_| FAILURE)?; }
            } else { run(git, repo, &["config", "--local", &format!("remote.{}.pushurl", request.target), &request.push_url]).map_err(|_| FAILURE)?; }
        }
        "rename" => { run(git, repo, &["remote", "rename", "--", &request.target, &request.name]).map_err(|_| FAILURE)?; }
        "remove" => { run(git, repo, &["remote", "remove", "--", &request.target]).map_err(|_| FAILURE)?; }
        _ => unreachable!(),
    }
    Ok("Remote configuration updated.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap(); let (git, _) = crate::git::find_git().unwrap();
        run(&git, dir.path(), &["init", "-q", "-b", "main"]).unwrap();
        for args in [["config","user.name","Test"], ["config","user.email","test@example.invalid"], ["config","commit.gpgsign","false"]] { run(&git,dir.path(),&args).unwrap(); }
        run(&git,dir.path(),&["commit","--allow-empty","-qm","Initial"]).unwrap();
        (dir,git)
    }
    fn request(git: &Path, repo: &Path, action: &str, target: &str, name: &str, fetch: &str, push: &str) -> RemoteRequest {
        RemoteRequest {action:action.into(),target:target.into(),name:name.into(),fetch_url:fetch.into(),push_url:push.into(),review_token:inspect(git,repo).unwrap().review_token}
    }
    #[test]
    fn add_edit_rename_remove_preserves_work_and_renames_tracking() {
        let (d,g) = fixture(); let repo=d.path(); std::fs::write(repo.join("local.txt"),"keep me").unwrap();
        execute(&g,repo,&request(&g,repo,"add","","origin","https://example.invalid/a.git","ssh://git@example.invalid/a.git")).unwrap();
        run(&g,repo,&["update-ref","refs/remotes/origin/main","HEAD"]).unwrap();
        run(&g,repo,&["branch","--set-upstream-to","origin/main"]).unwrap();
        execute(&g,repo,&request(&g,repo,"rename","origin","upstream","","")).unwrap();
        assert_eq!(String::from_utf8(run(&g,repo,&["rev-parse","--abbrev-ref","@{upstream}"]).unwrap()).unwrap().trim(),"upstream/main");
        assert_eq!(config(&g,repo,"upstream","pushurl"),vec!["ssh://git@example.invalid/a.git"]);
        execute(&g,repo,&request(&g,repo,"edit","upstream","","https://example.invalid/b.git","")).unwrap();
        assert!(config(&g,repo,"upstream","pushurl").is_empty());
        let state=inspect(&g,repo).unwrap(); assert_eq!(state.remotes[0].push_urls,state.remotes[0].fetch_urls);
        execute(&g,repo,&request(&g,repo,"remove","upstream","","","")).unwrap();
        assert!(inspect(&g,repo).unwrap().remotes.is_empty()); assert_eq!(std::fs::read_to_string(repo.join("local.txt")).unwrap(),"keep me");
    }
    #[test]
    fn stale_review_credentials_and_multiple_urls_are_refused() {
        let (d,g)=fixture(); let repo=d.path();
        let old=request(&g,repo,"add","","origin","https://example.invalid/a.git","");
        std::fs::write(repo.join("new.txt"),"changed after review").unwrap(); assert!(execute(&g,repo,&old).unwrap_err().contains("Repository changed"));
        for bad in ["https://token@example.invalid/a.git","https://user:secret@example.invalid/a.git","ssh://git:secret@example.invalid/a.git","https://example.invalid/a.git?token=secret","ext::sh -c secret"] { assert!(execute(&g,repo,&request(&g,repo,"add","","origin",bad,"")).is_err()); }
        execute(&g,repo,&request(&g,repo,"add","","origin","git@example.invalid:a.git","")).unwrap();
        run(&g,repo,&["config","--add","remote.origin.url","https://example.invalid/second.git"]).unwrap();
        assert!(execute(&g,repo,&request(&g,repo,"edit","origin","","https://example.invalid/new.git","")).unwrap_err().contains("multiple URLs"));
        assert_eq!(config(&g,repo,"origin","url").len(),2);
    }
    #[test]
    fn secret_urls_are_redacted_before_serialization() {
        let (d,g)=fixture();let repo=d.path();
        run(&g,repo,&["remote","add","origin","https://user:fixture-password@example.invalid/a.git?token=fixture-token#private"]).unwrap();
        let state=inspect(&g,repo).unwrap(); assert!(state.remotes[0].has_credentials);
        let json=serde_json::to_string(&state).unwrap(); for secret in ["fixture-password","fixture-token","private","user:"] { assert!(!json.contains(secret)); }
        assert!(json.contains("https://example.invalid/a.git"));
    }
    #[test]
    fn validates_names_and_operation_guard_without_mutation() {
        let (d,g)=fixture();let repo=d.path();
        for name in ["-x","../bad","a/b","a..b","a.lock"] { assert!(execute(&g,repo,&request(&g,repo,"add","",name,"https://example.invalid/a","")).is_err()); }
        let head=run(&g,repo,&["rev-parse","HEAD"]).unwrap(); std::fs::write(repo.join(".git/MERGE_HEAD"),head).unwrap();
        assert!(execute(&g,repo,&request(&g,repo,"add","","origin","https://example.invalid/a","")).unwrap_err().contains("Finish or abort"));
        assert!(inspect(&g,repo).unwrap().remotes.is_empty());
    }
}
