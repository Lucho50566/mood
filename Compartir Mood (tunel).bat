@echo off
cd /d "%~dp0"
title MOOD - tunel publico
echo.
echo   MOOD - Training Club  /  tunel publico
echo   -------------------------------------
echo   Sirve para:
echo     - Instalar la PWA desde el celular con HTTPS
echo     - Cobrar con Mercado Pago (webhook)
echo.
echo   Levantando el servidor...
start "MOOD - servidor" /min cmd /c "node server.js"
timeout /t 2 >nul

set "CF=..\bin\cloudflared.exe"
if not exist "%CF%" set "CF=cloudflared"

echo.
echo   Abriendo tunel. Copia la URL https://....trycloudflare.com
echo   y pegala en Admin - Ajustes - URL publica del servidor.
echo.
"%CF%" tunnel --url http://localhost:4400
pause
