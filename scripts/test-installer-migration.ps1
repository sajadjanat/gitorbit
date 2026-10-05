param([string]$NsisPath = (Join-Path $env:LOCALAPPDATA 'tauri/NSIS/makensis.exe'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $NsisPath)) { throw 'Build an NSIS bundle first to install the Tauri NSIS toolchain.' }
$testRepo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testId = [Guid]::NewGuid().ToString('N')
$testDir = Join-Path $testRepo ".dev/installer-migration-$testId"
$testKey = "Software\GitOrbit\InstallerTests\$testId"
New-Item -ItemType Directory -Path $testDir -Force | Out-Null
$testLegacy = Join-Path $testDir 'legacy'
$testFresh = Join-Path $testDir 'fresh'
New-Item -ItemType Directory -Path $testLegacy,$testFresh -Force | Out-Null
[System.IO.File]::WriteAllText((Join-Path $testLegacy 'workspace-monitor.exe'), 'Disposable binary marker')
$testState = Join-Path $testLegacy 'workspaces.json'
[System.IO.File]::WriteAllText($testState, '[{"name":"Existing workspace"}]')
$testStateHash = (Get-FileHash -LiteralPath $testState).Hash
$testUtils = Join-Path $testRepo 'src-tauri/target/release/nsis/x64/utils.nsh'
$testHook = Join-Path $testRepo 'src-tauri/windows/gitorbit-migration.nsh'
$testReport = Join-Path $testDir 'result.txt'
$testExe = Join-Path $testDir 'verify.exe'
$testPayload = Join-Path $testDir 'payload.txt'
[System.IO.File]::WriteAllText($testPayload, 'Replacement binary payload marker')
$testSource = @'
Unicode true
!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "Win\RestartManager.nsh"
!include "@UTILS@"
!define MANUFACTURER "sepehra"
!define PRODUCTNAME "GitOrbit"
!define MAINBINARYNAME "workspace-monitor"
!define MANUPRODUCTKEY "@KEY@\GitOrbit"
!define GITORBIT_LEGACY_PRODUCTKEY "@KEY@\Workspace Monitor"
!define GITORBIT_LEGACY_UNINSTKEY "@KEY@\LegacyUninstall"
!include "@HOOK@"
Name "GitOrbit installer migration verification"
OutFile "@EXE@"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
Var TestFailures

!macro CheckState label expectedPath expectedFlag
  ${If} $INSTDIR != "${expectedPath}"
  ${OrIf} $GitOrbitLegacyInstall != ${expectedFlag}
    IntOp $TestFailures $TestFailures + 1
    FileWrite $9 "FAIL: ${label}$\r$\n"
  ${Else}
    FileWrite $9 "PASS: ${label}$\r$\n"
  ${EndIf}
!macroend

!macro RegisterLegacy publisher
  WriteRegStr SHCTX "${GITORBIT_LEGACY_PRODUCTKEY}" "" "@LEGACY@"
  WriteRegStr SHCTX "${GITORBIT_LEGACY_UNINSTKEY}" "Publisher" "${publisher}"
  WriteRegStr SHCTX "${GITORBIT_LEGACY_UNINSTKEY}" "MainBinaryName" "workspace-monitor.exe"
!macroend

Section
  SetRegView 64
  SetShellVarContext current
  StrCpy $TestFailures 0
  FileOpen $9 "@REPORT@" w

  !insertmacro RegisterLegacy "sepehra"
  StrCpy $INSTDIR "@FRESH@"
  SetOutPath "$INSTDIR"
  !insertmacro NSIS_HOOK_PREINSTALL
  !insertmacro CheckState "verified legacy install reuses its directory" "@LEGACY@" 1
  File /oname=installed.txt "@PAYLOAD@"
  ${IfNot} ${FileExists} "@LEGACY@\installed.txt"
  ${OrIf} ${FileExists} "@FRESH@\installed.txt"
    IntOp $TestFailures $TestFailures + 1
    FileWrite $9 "FAIL: payload extracted outside the legacy install directory$\r$\n"
  ${Else}
    FileWrite $9 "PASS: payload extracted into the legacy install directory$\r$\n"
  ${EndIf}
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" "$INSTDIR"
  !insertmacro NSIS_HOOK_POSTINSTALL
  ReadRegStr $0 SHCTX "${GITORBIT_LEGACY_UNINSTKEY}" "Publisher"
  ${If} $0 != ""
    IntOp $TestFailures $TestFailures + 1
    FileWrite $9 "FAIL: legacy uninstall registration remained$\r$\n"
  ${Else}
    FileWrite $9 "PASS: legacy uninstall registration removed$\r$\n"
  ${EndIf}
  DeleteRegKey SHCTX "@KEY@"

  StrCpy $INSTDIR "@FRESH@"
  !insertmacro NSIS_HOOK_PREINSTALL
  !insertmacro NSIS_HOOK_POSTINSTALL
  !insertmacro CheckState "fresh install keeps its chosen directory" "@FRESH@" 0

  !insertmacro RegisterLegacy "unrelated-publisher"
  StrCpy $INSTDIR "@FRESH@"
  !insertmacro NSIS_HOOK_PREINSTALL
  !insertmacro NSIS_HOOK_POSTINSTALL
  !insertmacro CheckState "unrelated install is not migrated" "@FRESH@" 0
  ReadRegStr $0 SHCTX "${GITORBIT_LEGACY_UNINSTKEY}" "Publisher"
  ${If} $0 != "unrelated-publisher"
    IntOp $TestFailures $TestFailures + 1
    FileWrite $9 "FAIL: unrelated registry entry changed$\r$\n"
  ${Else}
    FileWrite $9 "PASS: unrelated registry entry retained$\r$\n"
  ${EndIf}
  DeleteRegKey SHCTX "@KEY@"

  !insertmacro RegisterLegacy "sepehra"
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" "@FRESH@"
  StrCpy $INSTDIR "@FRESH@"
  !insertmacro NSIS_HOOK_PREINSTALL
  !insertmacro NSIS_HOOK_POSTINSTALL
  !insertmacro CheckState "existing GitOrbit install is not redirected" "@FRESH@" 0

  DeleteRegKey SHCTX "@KEY@"
  FileClose $9
  SetErrorLevel $TestFailures
SectionEnd
'@
$testTokens = @{
    '@UTILS@' = $testUtils; '@KEY@' = $testKey; '@HOOK@' = $testHook
    '@EXE@' = $testExe; '@REPORT@' = $testReport; '@LEGACY@' = $testLegacy; '@FRESH@' = $testFresh; '@PAYLOAD@' = $testPayload
}
foreach ($token in $testTokens.Keys) { $testSource = $testSource.Replace($token, $testTokens[$token]) }
$testNsi = Join-Path $testDir 'verify.nsi'
[System.IO.File]::WriteAllText($testNsi, $testSource, [System.Text.UTF8Encoding]::new($false))
& $NsisPath /V2 $testNsi
if ($LASTEXITCODE -ne 0) { throw 'Migration verification harness failed to compile.' }
$testProcess = Start-Process -FilePath $testExe -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
Get-Content -LiteralPath $testReport
if ($testProcess.ExitCode -ne 0) { throw "Migration verification failed: $($testProcess.ExitCode) checks." }
if ((Get-FileHash -LiteralPath $testState).Hash -ne $testStateHash) { throw 'Legacy workspace state changed.' }
Write-Output 'PASS: legacy workspace state preserved'

