@echo off
setlocal
title Hephaestus (DEBUG)
cd /d "%~dp0"

echo [Hephaestus] ==================================================
echo [Hephaestus]  DEBUG MODE - authentication is bypassed.
echo [Hephaestus]  A passwordless debug admin is available on the
echo [Hephaestus]  sign-in screen. Do not use with real data; the
echo [Hephaestus]  debug account is deleted on the next normal start.
echo [Hephaestus] ==================================================

rem A backend left over from a normal launch would be reused as-is and
rem debug mode would NOT activate. Refuse to start until it is closed.
netstat -ano | findstr ":8155 " | findstr "LISTENING" >nul 2>nul && (
    echo [Hephaestus] A backend is already running on port 8155.
    echo [Hephaestus] Close the app first, then run this again.
    pause
    exit /b 1
)

set HEPH_DEBUG=1
call start.bat
