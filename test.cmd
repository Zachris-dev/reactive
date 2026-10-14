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

if /I "%~1"=="parser" (
  if not "%~2"=="" goto :usage
  call npm run test:parser
  set "TEST_ERROR=%ERRORLEVEL%"
  goto :check
)

if /I "%~1"=="creation" (
  if not "%~2"=="" goto :usage
  call npm run test:creation
  set "TEST_ERROR=%ERRORLEVEL%"
  goto :check
)

if /I "%~1"=="character" (
  if not "%~2"=="" goto :usage
  call npm run test:character
  set "TEST_ERROR=%ERRORLEVEL%"
  goto :check
)

if /I "%~1"=="all" (
  if not "%~2"=="" goto :usage
  call npm run test:all
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
echo Usage: test.cmd [roll^|result^|parser^|creation^|character^|all]
echo.
echo   no parameter  Run all tests
echo   roll          Run roll engine tests only
echo   result        Run resolution tests only
echo   parser        Run campaign parsing and selection tests
echo   creation      Run character creation tests ^(currently same suite^)
echo   character     Run character tests ^(currently same suite^)
echo   all           Run rules engine and parser tests
exit /b 2
