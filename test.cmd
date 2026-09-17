@echo off
setlocal
call npm test
if errorlevel 1 (
  echo.
  echo Tests failed.
  exit /b 1
)
echo.
echo Tests passed.
