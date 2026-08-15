@echo off
chcp 65001 > nul
title Traffic Catcher - CLI 수집기
echo ========================================================
echo   [Traffic Catcher] 실시간 트렌드 CLI 1회 수집 실행
echo ========================================================
echo.

set PYTHON_CMD=python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    set PYTHON_CMD="%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
)

%PYTHON_CMD% portal_crawler.py

pause
