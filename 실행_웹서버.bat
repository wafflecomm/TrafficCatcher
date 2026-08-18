@echo off
chcp 65001 > nul
cd /d "%~dp0"
title Traffic Catcher - 로컬 웹 서버 실행기
echo ========================================================
echo   [Traffic Catcher] 실시간 트렌드 및 주식 정보 수집기
echo   로컬 웹 서버 (Flask)를 기동합니다...
echo ========================================================
echo.

set "PYTHON_CMD=.venv\Scripts\python.exe"
set "TRAFFIC_CATCHER_PORT=5001"
if not exist "%PYTHON_CMD%" (
    echo [오류] 프로젝트 실행 환경이 없습니다.
    echo 먼저 Python을 설치한 뒤 다음 명령을 실행해 주세요:
    echo   python -m venv .venv
    echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
    pause
    exit /b 1
)

echo [1/2] 필수 라이브러리 검사 중...
"%PYTHON_CMD%" -c "import flask, requests, bs4, pandas, lxml, google.genai" >nul 2>&1
if errorlevel 1 "%PYTHON_CMD%" -m pip install -r requirements.txt

echo [2/2] 대시보드 웹 서버 시작 중... (http://127.0.0.1:%TRAFFIC_CATCHER_PORT%)
echo 브라우저에서 http://127.0.0.1:%TRAFFIC_CATCHER_PORT% 으로 접속하세요!
echo.
"%PYTHON_CMD%" portal_crawler.py --web

pause
