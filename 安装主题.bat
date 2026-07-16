@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "INSTALLER=%~dp0skills\codex-theme-studio\scripts\install-theme.ps1"
if not exist "%INSTALLER%" (
  echo Theme installer not found: %INSTALLER%
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)

echo Available themes:
for /d %%D in ("%~dp0examples\*") do if exist "%%~fD\theme.json" echo   %%~nxD
echo.
set /p "THEME=Enter a theme folder name: "
set "THEME_PATH=%~dp0examples\%THEME%"

if not defined THEME (
  echo No theme selected.
  pause
  exit /b 1
)
if not exist "%THEME_PATH%\theme.json" (
  echo Theme not found: %THEME_PATH%
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%" -ThemePath "%THEME_PATH%"
if errorlevel 1 (
  echo.
  echo Installation failed. Check the error above.
  pause
  exit /b 1
)

echo.
echo Installed. Close Codex, then launch it from the new themed desktop shortcut.
pause
