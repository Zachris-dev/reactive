@echo off
setlocal
call npm install
if errorlevel 1 (
  echo.
  echo Setup failed.
  exit /b 1
)
echo.
echo Setup complete.
