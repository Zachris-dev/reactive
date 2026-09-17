@echo off
setlocal
call npm run clean
if errorlevel 1 (
  echo.
  echo Clean failed.
  exit /b 1
)
echo.
echo Clean complete.
