@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" naver_blog_helper.py
) else (
    python naver_blog_helper.py
)

if errorlevel 1 pause
