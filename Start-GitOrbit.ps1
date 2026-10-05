$ErrorActionPreference = 'Stop'
$taskCandidates = @(
    (Join-Path $PSScriptRoot 'dist-desktop/GitOrbit.exe'),
    (Join-Path $PSScriptRoot 'src-tauri/target/release/workspace-monitor.exe'),
    (Join-Path $PSScriptRoot 'dist-desktop/Workspace Monitor.exe')
)
$taskAppPath = $taskCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $taskAppPath) { throw 'Build GitOrbit first: npm run tauri build' }
Start-Process -FilePath $taskAppPath -WorkingDirectory (Split-Path -Parent $taskAppPath) -WindowStyle Hidden
