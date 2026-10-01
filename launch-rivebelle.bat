@echo off
cd /d "%~dp0"

start "Rivebelle Backend" cmd /k "cd v2\backend && ..\\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8002"
start "Rivebelle Frontend" cmd /k "cd v2\frontend && npm run dev -- --port 5180"
