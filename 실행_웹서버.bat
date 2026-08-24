@echo off
cd /d "%~dp0"
title Traffic Catcher - Local Web Server
echo ========================================================
echo   [Traffic Catcher] Local Web Server
echo   Dashboard: http://127.0.0.1:5001
echo ========================================================
echo.

set "PYTHON_CMD=.venv\Scripts\python.exe"
set "TRAFFIC_CATCHER_PORT=5001"

powershell.exe -NoProfile -Command "$ProgressPreference = 'SilentlyContinue'; try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5001/' -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 (
    echo [READY] Traffic Catcher is already running.
    echo [OPEN ] http://127.0.0.1:5001
    echo.
    pause
    exit /b 0
)

if not exist "%PYTHON_CMD%" (
    echo [ERROR] Python virtual environment was not found.
    echo Run the following commands first:
    echo   python -m venv .venv
    echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
    pause
    exit /b 1
)

echo [1/2] Checking required libraries...
"%PYTHON_CMD%" -c "import flask, requests, bs4, pandas, lxml, google.genai" >nul 2>&1
if errorlevel 1 "%PYTHON_CMD%" -m pip install -r requirements.txt

echo [2/2] Starting dashboard server...
echo [OPEN ] http://127.0.0.1:%TRAFFIC_CATCHER_PORT%
echo.
"%PYTHON_CMD%" portal_crawler.py --web

pause
