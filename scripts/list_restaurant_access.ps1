[CmdletBinding()]
param(
  [int]$StoreId,
  [string]$Tenant
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $root "comanda-backend"

function Import-EnvFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }

  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -ne 2) { continue }
    $name = $parts[0].Trim()
    $value = $parts[1]
    if (-not $name) { continue }
    Set-Item -Path "Env:$name" -Value $value
  }
}

function Resolve-PythonExe {
  $venvPython = Join-Path $backendPath ".venv\Scripts\python.exe"
  if (Test-Path $venvPython) {
    return $venvPython
  }
  throw "No se encontro Python del backend en $venvPython"
}

Import-EnvFile -Path (Join-Path $backendPath ".env")

$pythonExe = Resolve-PythonExe
$scriptPath = Join-Path $backendPath "scripts\list_restaurant_access.py"
$argsList = @($scriptPath)

if ($StoreId) {
  $argsList += @("--store-id", "$StoreId")
}

if ($Tenant) {
  $argsList += @("--tenant", $Tenant)
}

Push-Location $backendPath
try {
  & $pythonExe @argsList
  if ($LASTEXITCODE -ne 0) {
    throw "La consulta devolvio exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
