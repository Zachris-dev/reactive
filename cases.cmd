@echo off
setlocal
call npm run cases -- %*
if errorlevel 1 (
  echo.
  echo Deterministic cases failed.
  exit /b 1
)
