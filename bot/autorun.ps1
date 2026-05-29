# Narze Bot Auto-Restart Script (PowerShell Version)
# วิธีใช้: powershell -ExecutionPolicy Bypass -File autorun.ps1

param(
    [int]$MaxRestart = 100,
    [int]$RestartDelay = 5,
    [string]$LogFile = "autorun.log"
)

# ฟังก์ชันสำหรับเขียน log
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage -ForegroundColor Green
    Add-Content -Path $LogFile -Value $logMessage
}

# ตั้งค่าเริ่มต้น
$Host.UI.RawUI.WindowTitle = "Narze Auto-Restart v4.0.3 PowerShell"
$restartCount = 0
$startTime = Get-Date

Write-Log "=== NARZE BOT AUTO-RESTART STARTED ==="
Write-Log "Max restarts: $MaxRestart"
Write-Log "Restart delay: $RestartDelay seconds"
Write-Log "Log file: $LogFile"

try {
    while ($true) {
        $restartCount++
        
        Write-Host "`n================================================" -ForegroundColor Cyan
        Write-Host "            NARZE BOT AUTO-RESTART" -ForegroundColor Cyan
        Write-Host "================================================" -ForegroundColor Cyan
        Write-Host "Start time: $(Get-Date)" -ForegroundColor Yellow
        Write-Host "Restart count: $restartCount/$MaxRestart" -ForegroundColor Yellow
        Write-Host "Uptime: $((Get-Date) - $startTime)" -ForegroundColor Yellow
        Write-Host ""
        
        # ตรวจสอบ max restart
        if ($restartCount -gt $MaxRestart) {
            Write-Log "ERROR: Max restart limit ($MaxRestart) reached!"
            Write-Host "Bot has been restarted $MaxRestart times." -ForegroundColor Red
            Write-Host "This might indicate a serious problem." -ForegroundColor Red
            Write-Host "Please check the bot manually." -ForegroundColor Red
            Read-Host "Press Enter to exit"
            exit 1
        }
        
        Write-Log "Starting Narze Bot (attempt $restartCount)..."
        
        # เริ่มต้นบอท
        try {
            $process = Start-Process -FilePath "bun" -ArgumentList "run", "dev" -Wait -PassThru -NoNewWindow
            $exitCode = $process.ExitCode
        }
        catch {
            Write-Log "ERROR: Failed to start bot process - $($_.Exception.Message)"
            $exitCode = -1
        }
        
        Write-Log "Bot process ended with exit code: $exitCode"
        
        # ตัดสินใจตาม exit code
        if ($exitCode -eq 0) {
            Write-Host "`n================================================" -ForegroundColor Green
            Write-Host "           BOT STOPPED NORMALLY" -ForegroundColor Green
            Write-Host "================================================" -ForegroundColor Green
            Write-Log "Bot stopped normally (exit code: 0)"
            
            $choice = Read-Host "`nBot stopped normally. Restart? (y/n)"
            if ($choice -eq 'n' -or $choice -eq 'N') {
                Write-Log "User chose to exit auto-restart"
                break
            }
            Write-Log "User chose to restart bot"
        }
        else {
            Write-Host "`n================================================" -ForegroundColor Red
            Write-Host "           BOT CRASHED - AUTO RESTART" -ForegroundColor Red
            Write-Host "================================================" -ForegroundColor Red
            Write-Log "Bot crashed with exit code: $exitCode"
            
            Write-Host "Restarting in $RestartDelay seconds..." -ForegroundColor Yellow
            Write-Host "Press Ctrl+C to cancel auto-restart" -ForegroundColor Yellow
            
            # Countdown
            for ($i = $RestartDelay; $i -gt 0; $i--) {
                Write-Host "Restarting in $i seconds..." -ForegroundColor Yellow
                Start-Sleep -Seconds 1
            }
        }
        
        Write-Host ""
    }
}
catch {
    Write-Log "FATAL ERROR: $($_.Exception.Message)"
    Write-Host "Fatal error occurred. Check log file: $LogFile" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Log "=== NARZE BOT AUTO-RESTART STOPPED ==="
Write-Host "Auto-restart stopped." -ForegroundColor Green
