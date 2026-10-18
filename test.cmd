@echo off
setlocal

if "%~1"=="" (
  call npm run test:all
  call set "TEST_ERROR=%%ERRORLEVEL%%"
  goto :check
)

if /I "%~1"=="roll" (
  if not "%~2"=="" goto :usage
  call npm run test:roll
  call set "TEST_ERROR=%%ERRORLEVEL%%"
  goto :check
)

if /I "%~1"=="result" (
  if not "%~2"=="" goto :usage
  call npm run test:result
  call set "TEST_ERROR=%%ERRORLEVEL%%"
  goto :check
)

if /I "%~1"=="parser" (
  if not "%~2"=="" if /I not "%~2"=="-v" if /I not "%~2"=="--verbose" goto :usage
  if not "%~3"=="" goto :usage
  if "%~2"=="" (
    call npm run test:parser
  ) else (
    call npm run test:parser -- %~2
  )
  call set "TEST_ERROR=%%ERRORLEVEL%%"
  goto :check
)

if /I "%~1"=="creation" (
  if not "%~2"=="" if /I not "%~2"=="-v" if /I not "%~2"=="--verbose" goto :usage
  if not "%~3"=="" goto :usage
  if "%~2"=="" (
    call npm run test:creation
  ) else (
    call npm run test:creation -- %~2
  )
  call set "TEST_ERROR=%%ERRORLEVEL%%"
  goto :check
)

if /I "%~1"=="character" (
  if not "%~2"=="" if /I not "%~2"=="-v" if /I not "%~2"=="--verbose" goto :usage
  if not "%~3"=="" goto :usage
  if "%~2"=="" (
    call npm run test:character
  ) else (
    call npm run test:character -- %~2
  )
  call set "TEST_ERROR=%%ERRORLEVEL%%"
  goto :check
)

if /I "%~1"=="all" (
  if not "%~2"=="" goto :usage
  call npm run test:all
  call set "TEST_ERROR=%%ERRORLEVEL%%"
  goto :check
)

if /I "%~1"=="validate" (
  if not "%~2"=="" goto :usage
  call npm run validate:campaign
  call set "TEST_ERROR=%%ERRORLEVEL%%"
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
echo Usage: test.cmd [roll^|result^|parser^|creation^|character^|validate^|all] [-v^|--verbose]
echo.
echo   no parameter  Run all test suites (grouped character results)
echo   roll          Run roll engine tests only
echo   result        Run resolution tests only
echo   parser        Run campaign parsing and selection tests
echo   creation      Run grouped parser, allocation, and save/load tests
echo   character     Run grouped parser, allocation, and save/load tests
echo   -v, --verbose List individual tests for parser, creation, and character
echo   validate      Check actual campaign files; fail on errors
echo   all           Run all test suites
exit /b 2
