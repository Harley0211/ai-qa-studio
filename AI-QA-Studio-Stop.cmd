@echo off
rem AI QA Studio - stop the public link, both servers and n8n.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\AI-QA-Studio.ps1" -Stop
echo.
pause
