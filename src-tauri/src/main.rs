// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = workspace_monitor_lib::interactive_rebase::editor_entry() { std::process::exit(code); }
    workspace_monitor_lib::run()
}
