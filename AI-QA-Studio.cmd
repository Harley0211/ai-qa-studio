@echo off
rem AI QA Studio - double-click to install (first time), update and run.
rem Works on its own too: copy just this file to a new PC and double-click it.
setlocal
set "PS1=%~dp0scripts\windows\AI-QA-Studio.ps1"
if not exist "%PS1%" (
  echo Downloading the AI QA Studio launcher from GitHub...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest 'https://raw.githubusercontent.com/Harley0211/ai-qa-studio/main/scripts/windows/AI-QA-Studio.ps1' -OutFile \"$env:TEMP\AI-QA-Studio.ps1\" -UseBasicParsing"
  set "PS1=%TEMP%\AI-QA-Studio.ps1"
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
echo.
pause
