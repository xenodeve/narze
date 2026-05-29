@echo off
title Narze Auto-Restart v4.0.3

:start
echo.
echo ================================================
echo            NARZE BOT AUTO-RESTART
echo ================================================
echo Starting bot at %DATE% %TIME%
echo.

rem เริ่มต้นบอท
bun run dev

rem เช็ค exit code
if %errorlevel% neq 0 (
    echo.
    echo ================================================
    echo           BOT CRASHED - RESTARTING
    echo ================================================
    echo Exit code: %errorlevel%
    echo Restarting in 5 seconds...
    echo.
    timeout /t 5 /nobreak >nul
    goto start
) else (
    echo.
    echo ================================================
    echo           BOT STOPPED NORMALLY
    echo ================================================
    echo Bot was stopped manually. Press any key to restart...
    pause >nul
    goto start
)

rem หากต้องการหยุด auto-restart ให้กด Ctrl+C