# Contributor notes

## Shared Git engine

The diagnostic CLI and GUI share the `git.rs`, `history.rs`, and `version_control.rs` source modules. Tests run in the CLI binary without loading the GUI's native dialog libraries.

```sh
cargo run --manifest-path src-tauri/Cargo.toml --bin monitor-cli -- /path/to/workspace
```

It prints a JSON snapshot and does not fetch remotes or edit source files.

Pass `--history /path/to/repository` to print the real commit graph data and refs. Integration tests create disposable repositories and a local bare remote for staging, committing, and pull scenarios.

## Native smoke test

Debug builds support an opt-in smoke test. Set `WORKSPACE_MONITOR_SMOKE_ROOT` to an existing workspace that has at least one repository needing attention, and `WORKSPACE_MONITOR_SMOKE_REPORT` to an absolute JSON output path before launching the debug app.

```powershell
npm run tauri build -- --debug --no-bundle
$env:WORKSPACE_MONITOR_SMOKE_ROOT = 'C:/Workspaces/example'
$env:WORKSPACE_MONITOR_SMOKE_REPORT = 'C:/Temp/workspace-monitor-smoke.json'
./src-tauri/target/debug/workspace-monitor.exe
```

Use a fixture repository with commits, a staged change, an unstaged `tracked.txt` file, and an untracked file. The app renders real Git results, opens the first repository, verifies graph rows, opens Version Control and a file diff, writes its report, and exits. It does not edit workspace source files or saved tabs. Clear these environment variables before a regular debug run. The mode is disabled in release builds.

## Optional local Windows toolchain

`scripts/local-toolchain.ps1` detects an external `WorkspaceMonitorBuildTools` folder under the current user's Local Application Data directory. If available, it activates the prepared Rust GNU and LLVM-MinGW toolchain for that command. It does not download tools, change the system PATH, or contain user-specific paths.

```powershell
./scripts/local-toolchain.ps1 npx tauri dev
./scripts/local-toolchain.ps1 cargo test --locked --manifest-path src-tauri/Cargo.toml
./scripts/local-toolchain.ps1 npx tauri build --bundles nsis
```

Fresh clones should use the standard Tauri prerequisites. Packaged app users need neither Node.js nor Rust.

## Documentation screenshots

Run `npm run docs:preview`, start Vite, and open `/.dev/readme-preview.html`. Capture the actual interface using the sample workspaces. `?git=missing` shows onboarding. Generated preview files remain in `.dev/`, which is ignored by Git; committed images live in `docs/images/`.

Use synthetic folder paths and repository names. Do not capture private workspace data in public documentation.
