@echo off
title WAgent - WhatsApp AI CRM
cd /d "%~dp0"
echo ========================================================
echo   WAgent - WhatsApp CRM con Inteligencia Artificial
echo   Ventas, Soporte, Notas de Voz y Gestion de Llamadas
echo ========================================================
echo.

set PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%
set NODE_ENV=production
set PORT=3001

echo Verificando puerto 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo Liberando proceso anterior en puerto 3001 (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Iniciando servidor y abriendo navegador en http://localhost:3001 ...
echo.
start http://localhost:3001
node server/index.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Ocurrio un error al iniciar. Presiona cualquier tecla para ver detalles...
    pause
)
