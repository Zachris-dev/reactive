@echo off
setlocal
node scripts\check-node.js
if errorlevel 1 (
  echo.
  echo Setup stopped because Node.js is too old.
  exit /b 1
)

call npm install
if errorlevel 1 (
  echo.
  echo Setup failed.
  exit /b 1
)
echo.
echo Setup complete.
