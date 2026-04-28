@echo off
setlocal

set "WORKSPACE=C:\Users\agust\Desktop\COMANDA_LOCAL"

if not exist "%WORKSPACE%\scripts\comanda_local.ps1" (
  echo COMANDA local workspace not found at %WORKSPACE%
  echo Create or update the local copy outside OneDrive before starting services.
  pause
  exit /b 1
)

echo Starting COMANDA from %WORKSPACE%...
powershell -ExecutionPolicy Bypass -File "%WORKSPACE%\scripts\comanda_local.ps1" -Action up

echo All services checked.
pause
