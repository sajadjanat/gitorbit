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

!macro NSIS_HOOK_POSTINSTALL
  ${If} $GitOrbitLegacyInstall = 1
    Push $0
    Push $1
    Push $2
    Push $3
    !insertmacro GitOrbitRenameShortcut "$DESKTOP\Workspace Monitor.lnk" "$DESKTOP\${PRODUCTNAME}.lnk"
    !insertmacro GitOrbitRenameShortcut "$SMPROGRAMS\Workspace Monitor.lnk" "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    DeleteRegKey SHCTX "${GITORBIT_LEGACY_UNINSTKEY}"
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  ${EndIf}
!macroend

