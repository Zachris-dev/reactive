@echo off
setlocal

if "%~1"=="" (
  call npm test
  goto :check
)

if /I "%~1"=="roll" (
  if not "%~2"=="" goto :usage
  call npm run test:roll
  goto :check
)

if /I "%~1"=="result" (
  if not "%~2"=="" goto :usage
  call npm run test:result
  goto :check
)

goto :usage

:check
if errorlevel 1 (
  echo.
  echo Tests failed.
  exit /b 1
)
echo.
echo Tests passed.
exit /b 0

:usage
echo Usage: test.cmd [roll^|result]
echo.
echo   no parameter  Run all tests
echo   roll          Run roll engine tests only
echo   result        Run resolution tests only
exit /b 2
