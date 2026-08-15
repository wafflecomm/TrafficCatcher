@echo off
chcp 65001 > nul
title Traffic Catcher - 로컬 웹 서버 실행기
echo ========================================================
echo   [Traffic Catcher] 실시간 트렌드 및 주식 정보 수집기
echo   로컬 웹 서버 (Flask)를 기동합니다...
echo ========================================================
echo.

set PYTHON_CMD=python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    set PYTHON_CMD="%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
)

echo [1/2] 필수 라이브러리 검사 중...
%PYTHON_CMD% -m pip install -r requirements.txt --quiet

echo [2/2] 대시보드 웹 서버 시작 중... (http://127.0.0.1:5000)
echo 브라우저에서 http://127.0.0.1:5000 으로 접속하세요!
echo.
%PYTHON_CMD% portal_crawler.py --web

pause
