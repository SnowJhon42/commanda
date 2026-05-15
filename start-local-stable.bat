@echo off
setlocal

cd /d C:\Users\agust\Desktop\COMANDA_LOCAL
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_stable.ps1

echo.
echo Stack local levantado por el orquestador oficial.
echo Verifica backend, client y staff con .\scripts\status_all_local.ps1 si hace falta.
pause
