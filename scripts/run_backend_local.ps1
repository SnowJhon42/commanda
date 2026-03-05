$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\comanda-backend"

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

Import-EnvFile -Path ".env"

$pythonCandidates = @(
  "C:\Users\agust\AppData\Local\Programs\Python\Python312\python.exe",
  "C:\Users\agust\AppData\Local\Python\bin\python.exe",
  "python",
  "py -3"
)

$pythonCommand = $null
foreach ($candidate in $pythonCandidates) {
  try {
    Invoke-Expression "$candidate --version" | Out-Null
    $pythonCommand = $candidate
    break
  } catch {
  }
}

if (-not $pythonCommand) {
  throw "No se encontró Python. Instalá Python 3.11+ con pip."
}

try {
  $pyVer = (Invoke-Expression "$pythonCommand -c `"import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')`"").Trim()
} catch {
  throw "No se pudo detectar version de Python."
}

if ($pyVer -eq "3.14") {
  throw "Python 3.14 no es compatible con los pins actuales del backend (pydantic-core). Usá Python 3.11, 3.12 o 3.13."
}

try {
  Invoke-Expression "$pythonCommand -m pip --version" | Out-Null
} catch {
  throw "Python detectado pero sin pip disponible. Reinstalá Python marcando 'Add pip' o instalá pip manualmente."
}

Invoke-Expression "$pythonCommand -m pip install -r requirements.txt"

$env:PYTHONPATH = (Get-Location).Path

# Inicializa DB desde docs SQL
Invoke-Expression "$pythonCommand scripts/init_db.py"

# Arranca API
Invoke-Expression "$pythonCommand -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
