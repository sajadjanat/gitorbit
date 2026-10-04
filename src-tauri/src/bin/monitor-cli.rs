use std::{collections::HashMap, path::Path};
#[path = "../git.rs"]
mod git;
use git::{find_git, scan, Workspace};
fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("Usage: monitor-cli <workspace-folder>");
        std::process::exit(2);
    };
    let Some((git, _)) = find_git() else {
        eprintln!("Git is not installed.");
        std::process::exit(1);
    };
    if !Path::new(&path).is_dir() {
        eprintln!("Workspace folder does not exist.");
        std::process::exit(2);
    }
    let name = Path::new(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into();
    let w = Workspace {
        id: "cli".into(),
        name,
        path,
        auto_fetch: false,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&scan(&w, &git, false, &HashMap::new(), None)).unwrap()
    );
}
