@echo off
title Narze Auto-Restart v4.0.3 Advanced

rem ตั้งค่าตัวแปร
set restart_count=0
set max_restart=100
set restart_delay=5

:start
set /a restart_count+=1

echo.
echo ================================================
echo            NARZE BOT AUTO-RESTART
echo ================================================
echo Start time: %DATE% %TIME%
echo Restart count: %restart_count%/%max_restart%
echo.

rem ตรวจสอบว่าเกิน max restart หรือไม่
if %restart_count% gtr %max_restart% (
    echo.
    echo ================================================
    echo         MAX RESTART LIMIT REACHED
    echo ================================================
    echo Bot has been restarted %max_restart% times.
    echo This might indicate a serious problem.
    echo Please check the bot manually.
    echo.
    pause
    exit /b 1
)

rem เริ่มต้นบอท
echo Starting Narze Bot...
bun run dev

rem เก็บ exit code
set bot_exit_code=%errorlevel%

rem ตรวจสอบ exit code และตัดสินใจ
if %bot_exit_code% equ 0 (
    echo.
    echo ================================================
    echo           BOT STOPPED NORMALLY
    echo ================================================
    echo Bot was stopped manually (exit code: 0)
    echo.
    echo [1] Restart bot
    echo [2] Exit
    echo.
    choice /c 12 /n /m "Choose option (1 or 2): "
    if errorlevel 2 (
        echo Exiting auto-restart...
        exit /b 0
    )
    if errorlevel 1 (
        echo Restarting bot...
        goto start
    )
) else (
    echo.
    echo ================================================
    echo           BOT CRASHED - AUTO RESTART
    echo ================================================
    echo Exit code: %bot_exit_code%
    echo Time: %DATE% %TIME%
    echo Restart attempt: %restart_count%
    echo.
    echo Restarting in %restart_delay% seconds...
    echo Press Ctrl+C to cancel auto-restart
    echo.
    
    rem แสดง countdown
    for /l %%i in (%restart_delay%,-1,1) do (
        echo Restarting in %%i seconds...
        timeout /t 1 /nobreak >nul
    )
    
    echo.
    goto start
)

rem หากมีปัญหาใดๆ
echo.
echo ================================================
echo              UNEXPECTED ERROR
echo ================================================
pause
exit /b 1
