$ErrorActionPreference = 'Stop'
$taskAppPath = Join-Path $PSScriptRoot 'dist-desktop/Workspace Monitor.exe'
if (-not (Test-Path -LiteralPath $taskAppPath)) {
    $taskAppPath = Join-Path $PSScriptRoot 'src-tauri/target/release/workspace-monitor.exe'
}
if (-not (Test-Path -LiteralPath $taskAppPath)) {
    throw 'Build the app first: npm run tauri build'
}
Start-Process -FilePath $taskAppPath -WorkingDirectory (Split-Path -Parent $taskAppPath) -WindowStyle Hidden
