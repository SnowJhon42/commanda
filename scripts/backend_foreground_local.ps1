$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $root "comanda-backend"
$pythonPath = Join-Path $backendPath ".venv\Scripts\python.exe"
$dbPath = (Join-Path $backendPath "comanda_dev.db").Replace("\", "/")

if (-not (Test-Path $pythonPath)) {
  throw "No se encontro Python del backend en $pythonPath"
}

Set-Location $backendPath
$env:ENVIRONMENT = "dev"
$env:DATABASE_URL = "sqlite:///$dbPath"

Write-Host "COMANDA backend local"
Write-Host "Workspace: $root"
Write-Host "DB: $dbPath"
Write-Host "URL: http://127.0.0.1:8001/health"
Write-Host ""
Write-Host "Deja esta ventana abierta mientras uses COMANDA."
Write-Host ""

& $pythonPath -m uvicorn app.main:app --host 127.0.0.1 --port 8001
