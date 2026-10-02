!macro ORCA_INSTALLER_LOG STAGE DETAIL
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  CreateDirectory "$LOCALAPPDATA\${PRODUCTNAME}"
  CreateDirectory "$LOCALAPPDATA\${PRODUCTNAME}\logs"
  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  FileOpen $7 "$LOCALAPPDATA\${PRODUCTNAME}\logs\installer.log" a
  FileWrite $7 "$2-$1-$0T$4:$5:$6 version=${VERSION} stage=${STAGE} ${DETAIL}$\r$\n"
  FileClose $7
  DetailPrint "OrcaCoder diagnostics: ${STAGE} ${DETAIL}"
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro ORCA_INSTALLER_LOG "install-start" "copying application files"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $NoShortcutMode = 1
    !insertmacro ORCA_INSTALLER_LOG "shortcuts-skipped" "installer was started with /NS"
  ${Else}
    ClearErrors
    CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    ${If} ${Errors}
      !insertmacro ORCA_INSTALLER_LOG "desktop-shortcut-failed" "path=$DESKTOP\${PRODUCTNAME}.lnk"
    ${Else}
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
      !insertmacro ORCA_INSTALLER_LOG "desktop-shortcut-created" "path=$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}

    ClearErrors
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    ${If} ${Errors}
      !insertmacro ORCA_INSTALLER_LOG "start-menu-shortcut-failed" "path=$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${Else}
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      !insertmacro ORCA_INSTALLER_LOG "start-menu-shortcut-created" "path=$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}
  !insertmacro ORCA_INSTALLER_LOG "install-complete" "application files and registry entries installed"
!macroend
