@echo off
echo Starting DictationAny...
echo.
echo [Backend]  http://192.168.111.10:3000
echo [Frontend] https://192.168.111.10:5160
echo.

start "DictationAny - Backend"  cmd /k "cd /d "%~dp0backend"  && npm run dev"
start "DictationAny - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 5 /nobreak >nul
start https://192.168.111.10:5160
