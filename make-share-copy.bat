@echo off
setlocal
REM ============================================================
REM  Creates a trimmed, ready-to-share copy of this app in a
REM  sibling folder (excludes dev-only stuff like node_modules).
REM  Recipients just double-click launch.bat inside the copy.
REM ============================================================

cd /d "%~dp0"

if not exist ".next\standalone\server.js" (
  echo The app is not built yet - run launch.bat once first.
  pause
  exit /b 1
)

set "DEST=%~dp0..\YuGiOh-Deck-Recommender-share"
echo Creating share copy at: %DEST%
echo.

REM Fold pending SQLite WAL writes into app.db so the copy is complete
REM (the copy excludes the -wal/-shm sidecar files).
set "NODE_EXE=%~dp0runtime\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
if exist "data\app.db" "%NODE_EXE%" "scripts\checkpoint-db.mjs" "data\app.db"

REM Note: /XD paths are absolute so only the top-level node_modules is
REM excluded — .next\standalone\node_modules must be copied for the app to run.
robocopy "%~dp0." "%DEST%" /E /NFL /NDL /NJH /NJS ^
  /XD "%~dp0node_modules" "%~dp0.next\cache" "%~dp0.git" ^
  /XF app.db-shm app.db-wal *.tsbuildinfo
if errorlevel 8 (
  echo Copy failed.
  pause
  exit /b 1
)

choice /M "Remove YOUR collection from the copy so it starts empty"
if errorlevel 2 goto :done

"%NODE_EXE%" "%DEST%\scripts\strip-collection.mjs" "%DEST%\data\app.db"

:done
echo.
echo Done. Share the folder: %DEST%
echo Recipients double-click launch.bat inside it.
pause
endlocal
