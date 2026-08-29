@echo off
rem Double-click to start the scan-lab workflow. Starts the local server and
rem opens the browser at http://127.0.0.1:8787/ — keep this window open while
rem scanning; closing it stops the server (the page then shows standalone mode).
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH. Install it with:
  echo     winget install OpenJS.NodeJS.LTS
  echo then run this again.
  pause
  exit /b 1
)
node "%~dp0scan-lab-server.mjs" %*
echo.
echo Server stopped.
pause
