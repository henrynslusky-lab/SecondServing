@echo off
title Second Serving - Local Website
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install the LTS release from https://nodejs.org/
  pause
  exit /b 1
)
echo Starting Second Serving at http://localhost:4173
echo Keep this window open. Press Ctrl+C to stop the server.
start "" "http://localhost:4173"
node local-server.mjs
pause
