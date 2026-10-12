@echo off
rem Double-click to start CardioLens (http://localhost:8000). Keep the window open; close it to stop.
title CardioLens
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python environment not found. See README "Run the app" for the one-time setup.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -u scripts\start.py
