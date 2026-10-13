@echo off
setlocal

if "%~1"=="" (
  call npm test
  set "TEST_ERROR=%ERRORLEVEL%"
  goto :check
)

if /I "%~1"=="roll" (
  if not "%~2"=="" goto :usage
  call npm run test:roll
  set "TEST_ERROR=%ERRORLEVEL%"
  goto :check
)

if /I "%~1"=="result" (
  if not "%~2"=="" goto :usage
  call npm run test:result
  set "TEST_ERROR=%ERRORLEVEL%"
  goto :check
)

goto :usage

:check
if not "%TEST_ERROR%"=="0" (
  echo.
  echo Tests failed.
  exit /b %TEST_ERROR%
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
