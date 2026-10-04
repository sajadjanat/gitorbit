pub mod git;
mod install;
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
#[tauri::command]
fn open_repository(
    app: tauri::AppHandle,
    state: State<AppState>,
    workspace_id: String,
    path: String,
) -> Result<(), String> {
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
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default().plugin(tauri_plugin_opener::init()).plugin(tauri_plugin_dialog::init()).manage(AppState::default())
        .on_page_load(|webview, payload| {
            #[cfg(debug_assertions)]
            if std::env::var_os("WORKSPACE_MONITOR_SMOKE_ROOT").is_some() && payload.event() == tauri::webview::PageLoadEvent::Finished {
                let _ = webview.eval(r#"(() => {
                    let attempts = 0;
                    const timer = setInterval(() => {
                        const rows = Array.from(document.querySelectorAll('tbody tr'));
                        const names = rows.flatMap(row => { const b = row.querySelector('td button'); return b ? [b.textContent] : []; });
                        if (!names.length && ++attempts < 160) return;
                        clearInterval(timer);
                        window.__TAURI_INTERNALS__.invoke('smoke_report', { report: { ok: names.length > 0, repositories: names, body: document.body.innerText } });
                    }, 250);
                })()"#);
            }
            #[cfg(not(debug_assertions))] let _ = (webview, payload);
        })
        .invoke_handler(tauri::generate_handler![load_workspaces, save_workspaces, scan_workspace, check_environment, install_git, open_git_download, open_repository, smoke_report])
        .run(tauri::generate_context!()).expect("error while running Workspace Monitor");
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
