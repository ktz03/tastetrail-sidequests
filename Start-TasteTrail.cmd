@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or later is required. Install Node.js, then open this file again.
  pause
  exit /b 1
)
echo Starting TasteTrail / Sidequests at http://127.0.0.1:3000
echo The window must stay open while using the app. Press Ctrl+C to stop.
start "" "http://127.0.0.1:3000"
node server.mjs
pause
