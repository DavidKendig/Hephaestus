@echo off
setlocal
title Hephaestus
cd /d "%~dp0"

where python >nul 2>nul || (echo [Hephaestus] Python not found in PATH. & pause & exit /b 1)
where npm >nul 2>nul || (echo [Hephaestus] Node.js/npm not found in PATH. & pause & exit /b 1)

rem First-run setup: install missing dependencies
python -c "import fastapi, httpx, ddgs, bs4, docx, openpyxl, fpdf, mammoth, pypdf, llmfit" >nul 2>nul || (
    echo [Hephaestus] Installing Python dependencies...
    pip install -r backend\requirements.txt || (pause & exit /b 1)
)

cd frontend
if not exist node_modules (
    echo [Hephaestus] Installing frontend dependencies...
    call npm install || (pause & exit /b 1)
)
if not exist dist\index.html (
    echo [Hephaestus] Building UI...
    call npm run build || (pause & exit /b 1)
)

echo [Hephaestus] Starting... close the app window to shut everything down.
call npx electron .
