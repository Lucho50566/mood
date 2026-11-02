@echo off
cd /d "%~dp0"
title MOOD Training Club
echo.
echo   MOOD - Training Club
echo   --------------------
start "MOOD - servidor" cmd /c "node server.js"
timeout /t 2 >nul
start "" http://localhost:4400
echo.
echo   Para abrirlo desde un celular (misma red WiFi):
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' } | ForEach-Object { '      http://' + $_.IPAddress + ':4400' }"
echo.
echo   Esta ventana se puede cerrar; el servidor queda en la otra.
echo.
echo   Para instalar la PWA en los telefonos o cobrar con Mercado Pago,
echo   usa "Compartir Mood (tunel).bat" (genera una URL HTTPS publica).
pause
