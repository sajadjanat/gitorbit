use std::{collections::HashMap, path::Path};
#[path = "../git.rs"]
mod git;
#[path = "../history.rs"]
mod history;
#[path = "../version_control.rs"]
mod version_control;
#[path = "../auth.rs"]
mod auth;
#[path = "../sync.rs"]
mod sync;
#[path = "../git_tools.rs"]
mod git_tools;
#[path = "../commit_options.rs"]
mod commit_options;
#[path = "../file_history.rs"]
mod file_history;
#[path = "../remotes.rs"]
mod remotes;
#[path = "../partial_stage.rs"]
mod partial_stage;
#[path = "../stash_tools.rs"]
mod stash_tools;
#[path = "../shelves.rs"]
mod shelves;
#[path = "../interactive_rebase.rs"]
mod interactive_rebase;
#[path = "../repository_setup.rs"]
mod repository_setup;
#[path = "../tag_tools.rs"]
mod tag_tools;
#[path = "../ignored_files.rs"]
mod ignored_files;
#[path = "../delete_files.rs"]
mod delete_files;
#[path = "../patch_tools.rs"]
mod patch_tools;
#[path = "../revision_tree.rs"]
mod revision_tree;
#[path = "../submodules.rs"]
mod submodules;
use git::{find_git, scan, Workspace};
fn main() {
    if let Some(code) = interactive_rebase::editor_entry() { std::process::exit(code); }
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).is_some_and(|a| a == "--history") {
        let result = (|| {
            let repo = args
                .get(2)
                .ok_or("Usage: monitor-cli --history <repository-folder>")?;
            let (git, _) = find_git().ok_or("Git is not installed.")?;
            history::read(&git, Path::new(repo), 200, "all")
        })();
        match result {
            Ok(history) => println!("{}", serde_json::to_string_pretty(&history).unwrap()),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return;
    }
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
