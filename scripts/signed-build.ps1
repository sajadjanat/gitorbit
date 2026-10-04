param([Parameter(ValueFromRemainingArguments = $true)][string[]]$BuildArguments)
$ErrorActionPreference = 'Stop'
# Local release credentials stay outside the checkout. The password is protected
# by Windows DPAPI and can only be decrypted by the account that created it.
$taskKeyDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'WorkspaceMonitorReleaseKeys'
$taskKey = Join-Path $taskKeyDir 'updater.key'
$taskPasswordFile = Join-Path $taskKeyDir 'password.dpapi'
if (-not (Test-Path -LiteralPath $taskKey) -or -not (Test-Path -LiteralPath $taskPasswordFile)) { throw 'Local signing credentials are unavailable. Use the signed release workflow or configure your local release key.' }
$taskSecure = (Get-Content -LiteralPath $taskPasswordFile -Raw).Trim() | ConvertTo-SecureString
$taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
try {
    $env:TAURI_SIGNING_PRIVATE_KEY = [IO.File]::ReadAllText($taskKey).Trim()
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    & (Join-Path $PSScriptRoot 'local-toolchain.ps1') npx tauri build --config src-tauri/tauri.release.conf.json @BuildArguments
    $taskExit = $LASTEXITCODE
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY,Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
}
exit $taskExit
