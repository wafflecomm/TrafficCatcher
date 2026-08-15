@echo off
chcp 65001 > nul
cd /d "%~dp0"
title Traffic Catcher - CLI 수집기
echo ========================================================
echo   [Traffic Catcher] 실시간 트렌드 CLI 1회 수집 실행
echo ========================================================
echo.

set "PYTHON_CMD=.venv\Scripts\python.exe"
if not exist "%PYTHON_CMD%" (
    echo [오류] 프로젝트 실행 환경이 없습니다. 실행_웹서버.bat의 안내를 확인해 주세요.
    pause
    exit /b 1
)

"%PYTHON_CMD%" portal_crawler.py

pause
