@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "RUNNER=%REPO_ROOT%scripts\run_unite_weekly_update.ps1"

if not exist "%RUNNER%" (
  echo Runner script not found: %RUNNER%
  pause
  exit /b 1
)

where pwsh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%RUNNER%" -Manual
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%RUNNER%" -Manual
)

set "EXIT_CODE=%ERRORLEVEL%"

echo.
if %EXIT_CODE% EQU 0 (
  echo Unite_Builds update pipeline completed successfully.
) else (
  echo Unite_Builds update pipeline failed with exit code %EXIT_CODE%.
)

pause
exit /b %EXIT_CODE%
