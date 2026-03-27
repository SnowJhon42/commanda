param(
  [string]$DestinationRoot = "C:\Users\agust\OneDrive\COMANDA_BACKUP"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$snapshotDir = Join-Path $DestinationRoot "snapshot-$timestamp"

New-Item -ItemType Directory -Force -Path $snapshotDir | Out-Null

$copyTargets = @(
  "AGENTS.md",
  "README.md",
  "package.json",
  "package-lock.json",
  "start-dev.bat",
  "comanda-backend",
  "comanda-front-client",
  "comanda-front-staff",
  "docs",
  "scripts",
  "tools",
  "ops",
  "agustin",
  "menu-images",
  "imagenes de platos"
)

$excludeDirs = @(".git", "node_modules", ".next", ".venv", "logs", "recordings", "backups", "__pycache__")
$excludeFiles = @("*.pid", "*.log", "*.sqlite*", "comanda_dev.db", "comanda_dev.db.*")

foreach ($target in $copyTargets) {
  $sourcePath = Join-Path $root $target
  if (-not (Test-Path $sourcePath)) { continue }

  $destinationPath = Join-Path $snapshotDir $target
  if (Test-Path $sourcePath -PathType Container) {
    & robocopy $sourcePath $destinationPath /E /XD $excludeDirs /XF $excludeFiles /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  } else {
    $destinationParent = Split-Path -Parent $destinationPath
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    Copy-Item -Path $sourcePath -Destination $destinationPath -Force
  }
}

Write-Host "Backup creado en: $snapshotDir"
