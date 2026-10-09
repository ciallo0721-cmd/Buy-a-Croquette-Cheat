@echo off
chcp 65001 >nul 2>&1
title Buy a Croquette - Infinite Croquette Patch  [INSTALL]
pushd "%~dp0"

echo.
echo   Installing patch, please wait...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set RC=%ERRORLEVEL%

echo.
if not "%RC%"=="0" echo   [ERROR] installer exited with code %RC%
popd

echo.
pause
exit /b %RC%
