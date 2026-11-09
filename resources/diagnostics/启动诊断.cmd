@echo off
setlocal
set "APP_PATH=%~dp0..\..\唐门AIGC工作台.exe"
powershell.exe -NoProfile -File "%~dp0launch-student-diagnostic.ps1" -AppPath "%APP_PATH%"
echo.
echo 诊断结束，日志位于：%LOCALAPPDATA%\tangmen-aigc\logs\launcher.log
pause
