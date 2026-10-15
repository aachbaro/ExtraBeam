@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0v2\start-dev.ps1"
if errorlevel 1 pause
