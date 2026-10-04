param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ToolArguments)
$ErrorActionPreference = 'Stop'
$taskToolRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'WorkspaceMonitorBuildTools'
if (Test-Path -LiteralPath (Join-Path $taskToolRoot 'cargo/bin/cargo.exe')) {
    $env:CARGO_HOME = Join-Path $taskToolRoot 'cargo'
    $env:RUSTUP_HOME = Join-Path $taskToolRoot 'rustup'
    $taskCompiler = Get-ChildItem -LiteralPath $taskToolRoot -Directory -Filter 'llvm-mingw-*' | Select-Object -First 1
    if (-not $taskCompiler) { throw 'The local compiler was not found. Use the standard Tauri prerequisites.' }
    $env:PATH = (Join-Path $taskCompiler.FullName 'bin') + ';' + (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:PATH
    $env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = Join-Path $taskCompiler.FullName 'bin/x86_64-w64-mingw32-gcc.exe'
    $env:RUSTFLAGS = '-C link-self-contained=yes -L native=' + (Join-Path $env:RUSTUP_HOME 'toolchains/stable-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained')
    $env:CARGO_BUILD_JOBS = '3'
}
if (-not $ToolArguments.Count) { throw 'Usage: ./scripts/local-toolchain.ps1 <program> [arguments]' }
$taskProgram = $ToolArguments[0]
$taskArguments = @($ToolArguments | Select-Object -Skip 1)
if ($taskProgram -in @('npm', 'npx')) { $taskProgram = $taskProgram + '.cmd' }
& $taskProgram @taskArguments
exit $LASTEXITCODE
