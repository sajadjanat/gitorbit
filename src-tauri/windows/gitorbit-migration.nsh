; GitOrbit rebrands Workspace Monitor while upgrading its existing Windows install.
; Keep the binary and application identifier stable for saved state and restarts.
!ifndef GITORBIT_LEGACY_UNINSTKEY
  !define GITORBIT_LEGACY_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Workspace Monitor"
!endif
!ifndef GITORBIT_LEGACY_PRODUCTKEY
  !define GITORBIT_LEGACY_PRODUCTKEY "Software\sepehra\Workspace Monitor"
!endif

Var GitOrbitLegacyInstall

!macro NSIS_HOOK_PREINSTALL
  Push $0
  Push $1
  Push $2
  StrCpy $GitOrbitLegacyInstall 0
  ReadRegStr $0 SHCTX "${MANUPRODUCTKEY}" ""
  ${If} $0 == ""
    ReadRegStr $0 SHCTX "${GITORBIT_LEGACY_PRODUCTKEY}" ""
    ReadRegStr $1 SHCTX "${GITORBIT_LEGACY_UNINSTKEY}" "Publisher"
    ReadRegStr $2 SHCTX "${GITORBIT_LEGACY_UNINSTKEY}" "MainBinaryName"
    ${If} $0 != ""
    ${AndIf} $1 == "${MANUFACTURER}"
    ${AndIf} $2 == "${MAINBINARYNAME}.exe"
      ${If} ${FileExists} "$0\${MAINBINARYNAME}.exe"
        StrCpy $INSTDIR $0
        ; Tauri sets the extraction directory before the preinstall hook.
        SetOutPath "$INSTDIR"
        StrCpy $GitOrbitLegacyInstall 1
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro GitOrbitRenameShortcut oldPath newPath
  !insertmacro IsShortcutTarget "${oldPath}" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    ${If} ${FileExists} "${newPath}"
      Delete "${oldPath}"
    ${Else}
      Rename "${oldPath}" "${newPath}"
    ${EndIf}
  ${EndIf}
!macroend

; Keep shortcut arguments, working directory and AppUserModelID intact. A new
; icon filename also avoids Explorer's cache for the unchanged executable path.
!macro GitOrbitSetShortcutIcon shortcut
  !insertmacro IsShortcutTarget "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r0 ""
    ${If} $0 P<> 0
      ${IUnknown::QueryInterface} $0 '("${IID_IPersistFile}",.r1)'
      ${If} $1 P<> 0
        ${IPersistFile::Load} $1 '("${shortcut}", ${STGM_READWRITE})'
        ${IShellLink::SetIconLocation} $0 '(w "$INSTDIR\gitorbit-icon-v3.ico", 0)'
        ${IPersistFile::Save} $1 '("${shortcut}",1)'
        ${IUnknown::Release} $1 ""
      ${EndIf}
      ${IUnknown::Release} $0 ""
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  Push $1
  Push $2
  Push $3
  ${If} $GitOrbitLegacyInstall = 1
    !insertmacro GitOrbitRenameShortcut "$DESKTOP\Workspace Monitor.lnk" "$DESKTOP\${PRODUCTNAME}.lnk"
    !insertmacro GitOrbitRenameShortcut "$SMPROGRAMS\Workspace Monitor.lnk" "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    DeleteRegKey SHCTX "${GITORBIT_LEGACY_UNINSTKEY}"
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\gitorbit-icon-v3.ico"
    !insertmacro GitOrbitSetShortcutIcon "$DESKTOP\${PRODUCTNAME}.lnk"
    !insertmacro GitOrbitSetShortcutIcon "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    !insertmacro GitOrbitSetShortcutIcon "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${PRODUCTNAME}.lnk"
    !insertmacro GitOrbitSetShortcutIcon "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Workspace Monitor.lnk"
    !if "${STARTMENUFOLDER}" != ""
      !insertmacro GitOrbitSetShortcutIcon "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
    !endif
    WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\gitorbit-icon-v3.ico,0"
    ; Tell Explorer that shortcut/icon associations were updated.
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
