@echo off
setlocal
title Hephaestus rebuild
cd /d "%~dp0"

where npm >nul 2>nul || (echo [Hephaestus] Node.js/npm not found in PATH. & pause & exit /b 1)

cd frontend
if not exist node_modules (
    echo [Hephaestus] Installing frontend dependencies...
    call npm install || (pause & exit /b 1)
)

echo [Hephaestus] Rebuilding UI...
call npm run build || (pause & exit /b 1)

echo [Hephaestus] Done. Restart the app to load the new build.
pause
