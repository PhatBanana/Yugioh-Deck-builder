@echo off
setlocal
REM ============================================================
REM  Yu-Gi-Oh! Deck Recommender - portable launcher
REM  Double-click to start. No installation required if the
REM  runtime\ folder is present (bundled Node.js).
REM ============================================================

cd /d "%~dp0"

REM App data (card DB, your collection, images) stays in .\data
set "YGOH_DATA_DIR=%~dp0data"
set "HOSTNAME=127.0.0.1"
if "%PORT%"=="" set "PORT=3000"

REM --- Pick a Node.js runtime: bundled first, then system ---
set "NODE_EXE=%~dp0runtime\node.exe"
if exist "%NODE_EXE%" goto :have_node

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found.
  echo   Either place a portable runtime at runtime\node.exe or install
  echo   Node.js 24+ from https://nodejs.org
  echo.
  pause
  exit /b 1
)
set "NODE_EXE=node"
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 23 (
  echo.
  echo   Your installed Node.js is too old ^(v%NODE_MAJOR%^). This app needs
  echo   Node.js 23 or newer. Install from https://nodejs.org or add a
  echo   portable runtime at runtime\node.exe
  echo.
  pause
  exit /b 1
)
:have_node

REM --- Make sure the app is built ---
if exist ".next\standalone\server.js" goto :run

echo First run: building the app ^(this needs npm and takes a minute^)...
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo   This copy has no pre-built app and npm is not available to build it.
  echo   Ask for a copy that includes the .next folder, or install Node.js
  echo   from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)
if not exist "node_modules" call npm install
call npm run build
if errorlevel 1 (
  echo Build failed - see output above.
  pause
  exit /b 1
)

:run
REM Standalone builds serve static assets from inside the standalone folder.
if not exist ".next\standalone\.next\static" (
  xcopy /E /I /Y /Q ".next\static" ".next\standalone\.next\static" >nul
)
if exist "public" if not exist ".next\standalone\public" (
  xcopy /E /I /Y /Q "public" ".next\standalone\public" >nul
)

echo Starting Yu-Gi-Oh! Deck Recommender on http://localhost:%PORT% ...
start "" "http://localhost:%PORT%"
"%NODE_EXE%" ".next\standalone\server.js"

REM If the server exits with an error, keep the window open to read it.
if errorlevel 1 pause
endlocal
