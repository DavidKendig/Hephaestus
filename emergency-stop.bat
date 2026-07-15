@echo off
rem Safety net: kill anything still listening on the Hephaestus backend port.
rem Normally unnecessary - the backend exits with the app automatically.
setlocal
set PORT=8155
set FOUND=0

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    set FOUND=1
    echo Killing backend process %%p on port %PORT%...
    taskkill /f /pid %%p >nul 2>nul
)

if "%FOUND%"=="0" echo No backend running on port %PORT% - nothing to clean up.
pause
