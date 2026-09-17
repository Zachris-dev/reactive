@echo off
setlocal
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed.
  exit /b 1
)
echo.
echo Build complete.
