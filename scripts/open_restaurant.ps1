[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Tenant,

  [int]$Tables = 12,

  [string]$Store,

  [string]$Pin = "1234",

  [string]$OwnerPassword = "1234",

  [string]$UsernamePrefix
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $root "comanda-backend"

if ($root -match "\\OneDrive(\\|$)") {
  throw "COMANDA no debe ejecutarse desde OneDrive. Usar la copia local, por ejemplo C:\Users\agust\Desktop\COMANDA_LOCAL."
}

if ($Tables -lt 1) {
  throw "-Tables debe ser >= 1."
}

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

  $pythonCandidates = @(
    "C:\Users\agust\AppData\Local\Programs\Python\Python312\python.exe",
    "C:\Users\agust\AppData\Local\Python\bin\python.exe",
    "python",
    "py -3"
  )

  foreach ($candidate in $pythonCandidates) {
    try {
      Invoke-Expression "$candidate --version" | Out-Null
      return $candidate
    } catch {
    }
  }

  throw "No se encontro Python para backend."
}

Import-EnvFile -Path (Join-Path $backendPath ".env")

$pythonExe = Resolve-PythonExe
$scriptPath = Join-Path $backendPath "scripts\add_empty_tenant.py"

if (-not (Test-Path $scriptPath)) {
  throw "No existe $scriptPath"
}

$argsList = @(
  $scriptPath,
  "--tenant", $Tenant,
  "--tables", "$Tables",
  "--pin", $Pin,
  "--owner-password", $OwnerPassword
)

if ($Store) {
  $argsList += @("--store", $Store)
}

if ($UsernamePrefix) {
  $argsList += @("--username-prefix", $UsernamePrefix)
}

Push-Location $backendPath
try {
  $output = & $pythonExe @argsList
  if ($LASTEXITCODE -ne 0) {
    throw "La apertura devolvio exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

$summary = @{}
foreach ($line in $output) {
  if ($line -match "^(?<key>[A-Za-z0-9_]+)=(?<value>.*)$") {
    $summary[$matches["key"]] = $matches["value"]
  }
}

$storeName = $summary["store"]
if (-not $storeName) {
  $storeName = if ($Store) { $Store } else { "$Tenant Centro" }
}

$adminUser = $summary["admin_user"]
if (-not $adminUser) {
  $adminUser = "admin_<prefijo>"
}

Write-Host ""
Write-Host "APERTURA_OK"
Write-Host "tenant=$Tenant"
Write-Host "store=$storeName"
Write-Host "tables=$Tables"
Write-Host "owner_password=$OwnerPassword"
Write-Host "staff_pin=$Pin"
Write-Host "admin_user=$adminUser"
Write-Host "staff_url=http://localhost:5174"
Write-Host "client_url=http://localhost:5173"
Write-Host ""
Write-Host "Estado operativo:"
Write-Host "- El restaurante ya fue dado de alta en la DB local."
Write-Host "- El duenio ya puede entrar a Staff en http://localhost:5174."
Write-Host "- Desde Staff puede cargar menu, categorias, productos e imagenes."
Write-Host "- Cliente quedara realmente listo para vender cuando el menu este cargado."
Write-Host ""
Write-Host "Salida tecnica:"
$output | ForEach-Object { Write-Host $_ }
