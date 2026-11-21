@echo off
setlocal
set "SERVER_DIR=%~dp0apps\character_server"
if /I "%~1"=="install" (
  pushd "%SERVER_DIR%"
  call npm.cmd install --strict-allow-scripts
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)
if /I "%~1"=="init" (
  pushd "%SERVER_DIR%"
  call npm.cmd run db:init
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)
if /I "%~1"=="seed" (
  pushd "%SERVER_DIR%"
  call npm.cmd run db:seed
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)
if /I "%~1"=="start" (
  pushd "%SERVER_DIR%"
  call npm.cmd run dev
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)
echo Usage: server.cmd install^|init^|seed^|start
echo.
echo   install  Install local server tools using reviewed npm install-script approvals
echo   init     Apply migrations to LOCAL D1 only
echo   seed     Create idempotent test_ accounts and campaigns in LOCAL D1
echo   start    Start a localhost-only development server
exit /b 2
