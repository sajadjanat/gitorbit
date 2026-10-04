use crate::git::{capture, command, executable, find_git};
use serde::Serialize;
use std::{path::PathBuf, time::Duration};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub available: bool,
    pub description: String,
    pub command: String,
    pub download_url: String,
    pub system_prompt: bool,
    #[serde(skip)]
    program: Option<PathBuf>,
    #[serde(skip)]
    args: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub platform: String,
    pub git_version: Option<String>,
    pub git_path: Option<String>,
    pub installer: InstallPlan,
}

pub fn plan() -> InstallPlan {
    let platform = std::env::consts::OS;
    let mut plan = InstallPlan {
        available: false,
        description: "Download Git from the official website, install it, then check again.".into(),
        command: String::new(),
        download_url: format!(
            "https://git-scm.com/install/{}",
            if platform == "macos" { "mac" } else { platform }
        ),
        system_prompt: false,
        program: None,
        args: vec![],
    };
    let candidate: Option<(PathBuf, Vec<&str>, &str, bool)> = match platform {
        "windows" => executable("winget").map(|p| (p, vec!["install", "--id", "Git.Git", "--exact", "--source", "winget", "--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity"], "Install Git using Windows Package Manager. Windows may ask for permission.", false)),
        "macos" => executable("brew").or_else(|| ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"].into_iter().map(PathBuf::from).find(|p| p.is_file())).map(|p| (p, vec!["install", "git"], "Install Git using Homebrew.", false)).or_else(|| Some((PathBuf::from("/usr/bin/xcode-select"), vec!["--install"], "Open Apple's developer tools installer. Complete the system dialog, then check again.", true))),
        "linux" => executable("pkexec").and_then(|pkexec| {
            for (manager, args) in [("apt-get", vec!["install", "-y", "git"]), ("dnf", vec!["install", "-y", "git"]), ("pacman", vec!["-S", "--needed", "--noconfirm", "git"]), ("zypper", vec!["--non-interactive", "install", "git"])] {
                if let Some(manager) = executable(manager) {
                    let mut all = vec![manager.to_string_lossy().into_owned()]; all.extend(args.into_iter().map(String::from));
                    plan.program = Some(pkexec.clone()); plan.args = all; plan.available = true;
                    plan.description = "Install Git using your system package manager. A system authentication dialog may appear.".into();
                    plan.command = format!("pkexec {}", plan.args.join(" ")); return None;
                }
            } None
        }),
        _ => None,
    };
    if let Some((program, args, description, system_prompt)) = candidate {
        plan.command = format!(
            "{} {}",
            program.file_name().unwrap_or_default().to_string_lossy(),
            args.join(" ")
        );
        plan.program = Some(program);
        plan.args = args.into_iter().map(String::from).collect();
        plan.available = true;
        plan.description = description.into();
        plan.system_prompt = system_prompt;
    }
    plan
}

pub fn environment() -> Environment {
    let git = find_git();
    Environment {
        platform: std::env::consts::OS.into(),
        git_version: git.as_ref().map(|(_, v)| v.clone()),
        git_path: git.map(|(p, _)| p.to_string_lossy().into()),
        installer: plan(),
    }
}

pub fn install() -> Result<String, String> {
    if find_git().is_some() {
        return Ok("Git is already installed.".into());
    }
    let plan = plan();
    let mut cmd = command(
        plan.program
            .ok_or("Automatic installation is unavailable. Use the official download page.")?,
    );
    cmd.args(plan.args);
    capture(cmd, Duration::from_secs(1200))?;
    if plan.system_prompt {
        Ok("Complete the system installer, then select Check again.".into())
    } else if find_git().is_some() {
        Ok("Git is ready.".into())
    } else {
        Err("The installer finished, but Git is not available yet. Complete any system prompts, then check again.".into())
    }
}
