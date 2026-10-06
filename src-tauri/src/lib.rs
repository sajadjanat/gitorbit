pub mod git;
pub mod history;
mod install;
pub mod version_control;
use git::{Snapshot, Workspace};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Default)]
struct Runtime {
    errors: HashMap<String, String>,
    fetched_at: Option<u64>,
}
#[derive(Default)]
struct AppState {
    workspaces: Arc<Mutex<Vec<Workspace>>>,
    runtimes: Mutex<HashMap<String, Arc<Mutex<Runtime>>>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    operation_locks: Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>,
}
fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("workspaces.json"))
        .map_err(|e| e.to_string())
}
fn read_workspaces(app: &tauri::AppHandle) -> Result<Vec<Workspace>, String> {
    #[cfg(debug_assertions)]
    if let Ok(root) = std::env::var("WORKSPACE_MONITOR_SMOKE_ROOT") {
        return Ok(vec![Workspace {
            id: "smoke".into(),
            name: "Native smoke test".into(),
            path: root,
            auto_fetch: false,
        }]);
    }
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Could not read saved workspaces: {e}"))
}
fn reset_watcher(app: &tauri::AppHandle, state: &AppState) -> Result<(), String> {
    let roots = state.workspaces.lock().map_err(|e| e.to_string())?.clone();
    let handle = app.clone();
    let event_roots = roots.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        if let Ok(event) = result {
            if matches!(event.kind, EventKind::Access(_)) {
                return;
            }
            for w in &event_roots {
                if event
                    .paths
                    .iter()
                    .any(|p| git::relevant_event(p, Path::new(&w.path)))
                {
                    let _ = handle.emit("workspace-invalidated", &w.id);
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;
    let mut errors = vec![];
    for w in roots {
        if let Err(e) = watcher.watch(Path::new(&w.path), RecursiveMode::Recursive) {
            errors.push(format!("{}: {e}", w.name));
        }
    }
    *state.watcher.lock().map_err(|e| e.to_string())? = Some(watcher);
    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "File watching unavailable for {}. Periodic refresh remains active.",
            errors.join("; ")
        ))
    }
}
#[tauri::command]
fn load_workspaces(
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<Vec<Workspace>, String> {
    let workspaces = read_workspaces(&app)?;
    *state.workspaces.lock().map_err(|e| e.to_string())? = workspaces.clone();
    let _ = reset_watcher(&app, &state);
    Ok(workspaces)
}
#[tauri::command]
fn save_workspaces(
    app: tauri::AppHandle,
    state: State<AppState>,
    workspaces: Vec<Workspace>,
) -> Result<Option<String>, String> {
    let mut ids = HashSet::new();
    let mut paths = HashSet::new();
    for w in &workspaces {
        let key = if cfg!(windows) {
            w.path
                .replace('\\', "/")
                .trim_end_matches('/')
                .to_lowercase()
        } else {
            w.path.trim_end_matches('/').to_owned()
        };
        if w.id.is_empty()
            || w.name.trim().is_empty()
            || w.path.is_empty()
            || !ids.insert(&w.id)
            || !paths.insert(key)
        {
            return Err("Workspaces require unique folders and IDs, and a name.".into());
        }
        // Existing folders may be disconnected drives. Preserve them until the user closes their tab.
        if !state
            .workspaces
            .lock()
            .map_err(|e| e.to_string())?
            .iter()
            .any(|old| old.path == w.path)
            && !Path::new(&w.path).is_dir()
        {
            return Err("Choose an existing workspace folder.".into());
        }
    }
    let path = config_path(&app)?;
    fs::create_dir_all(path.parent().ok_or("Invalid settings path")?).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(&workspaces).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
    state
        .runtimes
        .lock()
        .map_err(|e| e.to_string())?
        .retain(|id, _| workspaces.iter().any(|w| &w.id == id));
    *state.workspaces.lock().map_err(|e| e.to_string())? = workspaces;
    Ok(reset_watcher(&app, &state).err())
}
#[tauri::command]
async fn scan_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
    fetch: bool,
) -> Result<Snapshot, String> {
    let w = state
        .workspaces
        .lock()
        .map_err(|e| e.to_string())?
        .iter()
        .find(|w| w.id == workspace_id)
        .cloned()
        .ok_or("Workspace is no longer open")?;
    let runtime = state
        .runtimes
        .lock()
        .map_err(|e| e.to_string())?
        .entry(workspace_id)
        .or_default()
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
        let (git, _) =
            git::find_git().ok_or("Git is not installed. Install Git to monitor workspaces.")?;
        if !Path::new(&w.path).is_dir() {
            return Err(
                "Workspace folder is unavailable. Reconnect the drive or close this tab.".into(),
            );
        }
        let snapshot = git::scan(&w, &git, fetch, &runtime.errors, runtime.fetched_at);
        runtime.errors = snapshot
            .repositories
            .iter()
            .filter_map(|r| r.fetch_error.as_ref().map(|e| (r.path.clone(), e.clone())))
            .collect();
        runtime.fetched_at = snapshot.fetched_at;
        Ok(snapshot)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn check_environment() -> Result<install::Environment, String> {
    tauri::async_runtime::spawn_blocking(install::environment)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn install_git() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(install::install)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn open_git_download(app: tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(install::plan().download_url, None::<&str>)
        .map_err(|e| e.to_string())
}
fn repository_path(state: &AppState, workspace_id: &str, path: &str) -> Result<PathBuf, String> {
    let root = state
        .workspaces
        .lock()
        .map_err(|e| e.to_string())?
        .iter()
        .find(|w| w.id == workspace_id)
        .map(|w| w.path.clone())
        .ok_or("Workspace is no longer open")?;
    let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let path = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !path.starts_with(root) || !path.join(".git").exists() {
        return Err("Choose a repository inside the workspace.".into());
    }
    Ok(path)
}
#[tauri::command]
fn open_repository(
    app: tauri::AppHandle,
    state: State<AppState>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
    let path = repository_path(&state, &workspace_id, &path)?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn repository_history(
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
    limit: usize,
    scope: String,
) -> Result<history::History, String> {
    let path = repository_path(&state, &workspace_id, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (git, _) = git::find_git().ok_or("Git is not installed.")?;
        history::read(&git, &path, limit, &scope)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn repository_outgoing(
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
) -> Result<version_control::Outgoing, String> {
    let path = repository_path(&state, &workspace_id, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (git, _) = git::find_git().ok_or("Git is not installed.")?;
        version_control::outgoing(&git, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn repository_commit_files(
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
    commit_hash: String,
) -> Result<Vec<version_control::CommitFile>, String> {
    let path = repository_path(&state, &workspace_id, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (git, _) = git::find_git().ok_or("Git is not installed.")?;
        version_control::outgoing_commit_files(&git, &path, &commit_hash)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn repository_commit_diff(
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
    commit_hash: String,
    file: String,
) -> Result<version_control::CommitDiff, String> {
    let path = repository_path(&state, &workspace_id, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (git, _) = git::find_git().ok_or("Git is not installed.")?;
        version_control::outgoing_commit_diff(&git, &path, &commit_hash, &file)
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn push_repository(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
    expected_head: String,
    expected_upstream_head: String,
) -> Result<String, String> {
    let path = repository_path(&state, &workspace_id, &path)?;
    let lock = state
        .operation_locks
        .lock()
        .map_err(|e| e.to_string())?
        .entry(path.clone())
        .or_default()
        .clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let (git, _) = git::find_git().ok_or("Git is not installed.")?;
        version_control::push(&git, &path, &expected_head, &expected_upstream_head)
    })
    .await
    .map_err(|e| e.to_string())?;
    let _ = app.emit("workspace-invalidated", &workspace_id);
    result
}
#[tauri::command]
async fn repository_changes(
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
) -> Result<git::Repository, String> {
    let path = repository_path(&state, &workspace_id, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (git, _) = git::find_git().ok_or("Git is not installed.")?;
        version_control::changes(&git, &path)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn repository_diff(
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
    file: String,
    staged: bool,
) -> Result<version_control::Diff, String> {
    let path = repository_path(&state, &workspace_id, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (git, _) = git::find_git().ok_or("Git is not installed.")?;
        version_control::diff(&git, &path, &file, staged)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn repository_action(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    path: String,
    action: String,
    paths: Vec<String>,
    message: Option<String>,
) -> Result<String, String> {
    let path = repository_path(&state, &workspace_id, &path)?;
    let lock = state
        .operation_locks
        .lock()
        .map_err(|e| e.to_string())?
        .entry(path.clone())
        .or_default()
        .clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|e| e.to_string())?;
        let (git, _) = git::find_git().ok_or("Git is not installed.")?;
        version_control::action(&git, &path, &action, &paths, message.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?;
    // A failing hook or pull can still have changed Git metadata; always refresh.
    let _ = app.emit("workspace-invalidated", &workspace_id);
    result
}

fn update_connection_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("updates.json"))
}
#[tauri::command]
fn update_connection(app: tauri::AppHandle) -> Result<String, String> {
    let path = update_connection_path(&app)?;
    if !path.exists() {
        return Ok("system".into());
    }
    let mode: String = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if !["system", "direct"].contains(&mode.as_str()) {
        return Err("Choose a valid update connection.".into());
    }
    Ok(mode)
}
#[tauri::command]
fn save_update_connection(app: tauri::AppHandle, mode: String) -> Result<(), String> {
    if !["system", "direct"].contains(&mode.as_str()) {
        return Err("Choose a valid update connection.".into());
    }
    let path = update_connection_path(&app)?;
    fs::create_dir_all(
        path.parent()
            .ok_or("Update settings folder is unavailable.")?,
    )
    .map_err(|e| e.to_string())?;
    fs::write(path, serde_json::to_vec(&mode).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn check_app_update(
    app: tauri::AppHandle,
    webview: tauri::Webview,
) -> Result<Option<serde_json::Value>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let mut builder = webview
        .updater_builder()
        .timeout(std::time::Duration::from_secs(20));
    if update_connection(app)? == "direct" {
        builder = builder.no_proxy();
    }
    let updater = builder.build().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|update| {
        let metadata = serde_json::json!({"currentVersion": update.current_version, "version": update.version, "body": update.body, "date": update.raw_json.get("pub_date"), "rawJson": update.raw_json});
        let rid = webview.resources_table().add(update);
        let mut metadata = metadata;
        metadata["rid"] = serde_json::json!(rid);
        metadata
    }))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    // Use the transparent RGBA source for window and taskbar icons as well as
    // the executable's ICO resources used by Explorer.
    context.set_default_window_icon(Some(tauri::include_image!("icons/128x128@2x.png")));
    tauri::Builder::default().plugin(tauri_plugin_opener::init()).plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_updater::Builder::new().build()).plugin(tauri_plugin_process::init()).manage(AppState::default())
        .on_page_load(|webview, payload| {
            #[cfg(debug_assertions)]
            if std::env::var_os("WORKSPACE_MONITOR_SMOKE_ROOT").is_some() && payload.event() == tauri::webview::PageLoadEvent::Finished {
                if std::env::var_os("WORKSPACE_MONITOR_SMOKE_UPDATE").is_some() {
                    let _ = webview.eval(r#"window.__TAURI_INTERNALS__.invoke('smoke_update').then(report => window.__TAURI_INTERNALS__.invoke('smoke_report', {report}), error => window.__TAURI_INTERNALS__.invoke('smoke_report', {report: {ok: false, error: String(error)}}))"#);
                    return;
                }
                let _ = webview.eval(r#"(() => {
                    let attempts = 0, phase = 0, names = [], graphRows = 0;
                    const finish = (ok) => {
                        clearInterval(timer);
                        window.__TAURI_INTERNALS__.invoke('smoke_report', { report: { ok, repositories: names, graphRows, body: document.body.innerText } });
                    };
                    const timer = setInterval(() => {
                        if (++attempts > 200) return finish(false);
                        if (phase === 0) {
                            const buttons = Array.from(document.querySelectorAll('tbody tr td:first-child button'));
                            names = buttons.map(b => b.textContent);
                            if (!names.length) return;
                            buttons[0].click(); phase = 1;
                        } else if (phase === 1) {
                            graphRows = document.querySelectorAll('[data-graph-row]').length;
                            if (!graphRows) return;
                            const tab = Array.from(document.querySelectorAll('[role=tab]')).find(t => t.textContent.startsWith('Version Control'));
                            if (!tab) return;
                            tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); phase = 2;
                        } else {
                            const body = document.body.innerText;
                            const message = document.querySelector('textarea#commit-message');
                            if (!message || !body.includes('Staged') || !body.includes('Unversioned Files')) return;
                            const file = Array.from(document.querySelectorAll('[role=tabpanel] button')).find(b => b.title === 'tracked.txt');
                            if (phase === 2) { if (file) { file.click(); phase = 3; } return; }
                            if (phase === 3 && !document.querySelector('[aria-label="File diff"]')?.textContent.includes('+Changed')) return;
                            finish(true);
                        }
                    }, 250);
                })()"#);
            }
            #[cfg(not(debug_assertions))] let _ = (webview, payload);
        })
        .invoke_handler(tauri::generate_handler![load_workspaces, save_workspaces, scan_workspace, check_environment, install_git, open_git_download, open_repository, repository_history, repository_outgoing, repository_commit_files, repository_commit_diff, push_repository, repository_changes, repository_diff, repository_action, update_connection, save_update_connection, check_app_update, smoke_report, smoke_update])
        .run(context).expect("error while running GitOrbit");
}

#[tauri::command]
async fn smoke_update(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(debug_assertions)]
    {
        use tauri_plugin_updater::UpdaterExt;
        if std::env::var_os("WORKSPACE_MONITOR_SMOKE_ROOT").is_none()
            || std::env::var_os("WORKSPACE_MONITOR_SMOKE_UPDATE").is_none()
        {
            return Err("Update smoke testing is disabled.".into());
        }
        // Download the current release to verify transport and signatures without
        // installing it or allowing downgrades in a production build.
        let mut builder = app
            .updater_builder()
            .timeout(std::time::Duration::from_secs(45))
            .version_comparator(|_, _| true);
        if update_connection(app.clone())? == "direct" {
            builder = builder.no_proxy();
        }
        let updater = builder.build().map_err(|e| e.to_string())?;
        let update = updater
            .check()
            .await
            .map_err(|e| format!("{e:?}"))?
            .ok_or("No update manifest found.")?;
        let bytes = update
            .download(|_, _| {}, || {})
            .await
            .map_err(|e| format!("{e:?}"))?;
        Ok(
            serde_json::json!({"ok": !bytes.is_empty(), "version": update.version, "signatureVerified": true, "downloadedBytes": bytes.len(), "installed": false}),
        )
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = app;
        Err("Update smoke testing is unavailable in release builds.".into())
    }
}

#[tauri::command]
fn smoke_report(app: tauri::AppHandle, report: serde_json::Value) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        if std::env::var_os("WORKSPACE_MONITOR_SMOKE_ROOT").is_none() {
            return Err("Smoke testing is disabled.".into());
        }
        let path = std::env::var("WORKSPACE_MONITOR_SMOKE_REPORT").map_err(|e| e.to_string())?;
        fs::write(
            path,
            serde_json::to_vec_pretty(&report).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        app.exit(if report["ok"] == true { 0 } else { 1 });
        Ok(())
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = (app, report);
        Err("Smoke testing is unavailable in release builds.".into())
    }
}
