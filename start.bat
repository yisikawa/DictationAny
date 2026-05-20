@echo off
echo Starting DictationAny...
echo.
echo [Backend]  http://localhost:3000
echo [Frontend] http://localhost:5173
echo.

start "DictationAny - Backend"  cmd /k "cd /d "%~dp0backend"  && npm run dev"
start "DictationAny - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 5 /nobreak >nul
start http://localhost:5173
