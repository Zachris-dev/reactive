@echo off
setlocal EnableDelayedExpansion
set "SERVER_DIR=%~dp0apps\character_server"
if /I "%~1"=="install" goto :install
if /I "%~1"=="init" goto :init
if /I "%~1"=="seed" goto :seed
if /I "%~1"=="reset" goto :reset
if /I "%~1"=="start" goto :start
goto :usage

:install
pushd "%SERVER_DIR%" || exit /b 1
call npm.cmd install --strict-allow-scripts
set "EXIT_CODE=!ERRORLEVEL!"
popd
exit /b !EXIT_CODE!

:init
pushd "%SERVER_DIR%" || exit /b 1
call npm.cmd run db:init
set "EXIT_CODE=!ERRORLEVEL!"
popd
exit /b !EXIT_CODE!

:seed
pushd "%SERVER_DIR%" || exit /b 1
call npm.cmd run db:seed
set "EXIT_CODE=!ERRORLEVEL!"
popd
exit /b !EXIT_CODE!

:reset
echo.
echo Reset LOCAL developer test data only:
echo   - Remove user-created test campaigns, their members and invitations.
echo   - Clear invitations and changed membership in baseline test campaigns.
echo   - Restore seeded test-user roles and baseline membership.
echo   - PRESERVE all normal campaigns, their memberships, and accounts.
echo.
echo Stop the local Character Server before running reset.
echo.
set "ANSWER="
set /p "ANSWER=Type RESET to continue (anything else cancels): "
if /I not "!ANSWER!"=="RESET" (
  echo Cancelled. No data changed.
  exit /b 1
)
pushd "%SERVER_DIR%" || exit /b 1
call npm.cmd run db:reset
if errorlevel 1 (
  echo Local reset SQL failed. Seed was not run.
  popd
  exit /b 1
)
call npm.cmd run db:seed
set "EXIT_CODE=!ERRORLEVEL!"
popd
if not "!EXIT_CODE!"=="0" (
  echo Reset SQL completed but restoring baseline fixtures failed.
  exit /b !EXIT_CODE!
)
echo Local test data reset. Normal campaigns were not targeted.
exit /b 0

:start
pushd "%SERVER_DIR%" || exit /b 1
call npm.cmd run dev
set "EXIT_CODE=!ERRORLEVEL!"
popd
exit /b !EXIT_CODE!

:usage
echo Usage: server.cmd install^|init^|seed^|reset^|start
echo.
echo   install  Install local server tools using reviewed npm install-script approvals
echo   init     Apply migrations to LOCAL D1 only
echo   seed     Add missing test_ users and baseline campaigns without deleting data
echo   reset    Reset LOCAL test campaigns and users to seeded starting state
echo   start    Start a localhost-only development server
exit /b 2
