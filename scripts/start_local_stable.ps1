$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

Write-Host "start_local_stable delega en scripts\\comanda_local.ps1 para mantener PIDs, logs y puertos bajo un solo control."
& (Join-Path $PSScriptRoot "comanda_local.ps1") -Action up
