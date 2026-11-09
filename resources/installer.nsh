!macro customInstall
  DetailPrint "Installing Microsoft Visual C++ Redistributable x64"
  ExecWait '"$INSTDIR\resources\vc_redist_x64.exe" /install /quiet /norestart' $0
  DetailPrint "VC++ Redistributable installer exit code: $0"
  IntCmp $0 0 vcRuntimeReady
  IntCmp $0 3010 vcRuntimeReady vcRuntimeFailed vcRuntimeFailed
vcRuntimeFailed:
  MessageBox MB_ICONSTOP "Microsoft Visual C++ 2015-2022 x64 runtime installation failed (exit code $0). Setup will stop without launching the app."
  Abort
vcRuntimeReady:
  Delete "$newStartMenuLink"
  CreateShortCut "$newStartMenuLink" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -WindowStyle Hidden -File "$INSTDIR\resources\diagnostics\launch-student-diagnostic.ps1" -AppPath "$appExe"' "$appExe" 0
  ${if} ${FileExists} "$newDesktopLink"
    Delete "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -WindowStyle Hidden -File "$INSTDIR\resources\diagnostics\launch-student-diagnostic.ps1" -AppPath "$appExe"' "$appExe" 0
  ${endIf}
!macroend
