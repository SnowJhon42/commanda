param(
  [ValidateSet("up", "down", "status", "restart", "logs", "doctor", "start", "stop")]
  [string]$Action = "up"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$backendPath = Join-Path $root "comanda-backend"
$clientPath = Join-Path $root "comanda-front-client"
$staffPath = Join-Path $root "comanda-front-staff"

$backendPidFile = Join-Path $logsDir "backend.pid"
$clientPidFile = Join-Path $logsDir "front-client.pid"
$staffPidFile = Join-Path $logsDir "front-staff.pid"

$services = @(
  @{ Name = "Backend"; Port = 8000; Url = "http://localhost:8000/health"; PidFile = $backendPidFile; OutLog = "backend.out.log"; ErrLog = "backend.err.log" },
  @{ Name = "Client"; Port = 5173; Url = "http://localhost:5173"; PidFile = $clientPidFile; OutLog = "front-client.out.log"; ErrLog = "front-client.err.log" },
  @{ Name = "Staff"; Port = 5174; Url = "http://localhost:5174"; PidFile = $staffPidFile; OutLog = "front-staff.out.log"; ErrLog = "front-staff.err.log" }
)

function Resolve-PythonCommand {
  $venvPython = Join-Path $backendPath ".venv\Scripts\python.exe"
  if (Test-Path $venvPython) { return $venvPython }

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

function Write-PidFile {
  param([string]$Path, [int]$ProcessId)
  "$ProcessId" | Set-Content -Path $Path -Encoding ASCII
}

function Read-PidFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $null }
  $raw = (Get-Content $Path -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (-not $raw) { return $null }
  $storedProcessId = 0
  if ([int]::TryParse($raw.Trim(), [ref]$storedProcessId)) {
    return $storedProcessId
  }
  return $null
}

function Ensure-EnvFile {
  param([string]$ProjectPath)
  $envFile = Join-Path $ProjectPath ".env.local"
  if (-not (Test-Path $envFile)) {
    "VITE_API_URL=http://localhost:8000" | Set-Content -Path $envFile -Encoding ASCII
  }
}

function Get-ListeningPidsForPort {
  param([int]$Port)
  $lines = netstat -ano | Select-String ":$Port "
  $pids = @()
  foreach ($line in $lines) {
    $parts = ($line -replace "\s+", " ").Trim().Split(" ")
    if ($parts.Length -ge 5 -and $parts[3] -eq "LISTENING" -and $parts[4] -match "^\d+$") {
      $pids += [int]$parts[4]
    }
  }
  return $pids | Select-Object -Unique
}

function Stop-FromPidFile {
  param([string]$Name, [string]$PidFile)
  $storedProcessId = Read-PidFile -Path $PidFile
  if (-not $storedProcessId) {
    Write-Host "${Name}: sin PID guardado."
    return
  }

  try {
    Stop-Process -Id $storedProcessId -Force -ErrorAction Stop
    Write-Host "${Name}: detenido (PID $storedProcessId)."
  } catch {
    Write-Host "${Name}: PID $storedProcessId no estaba activo."
  } finally {
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  }
}

function Stop-StaleListeners {
  foreach ($svc in $services) {
    $pids = Get-ListeningPidsForPort -Port $svc.Port
    if (-not $pids -or $pids.Count -eq 0) { continue }

    foreach ($listenerPid in $pids) {
      try {
        Stop-Process -Id $listenerPid -Force -ErrorAction Stop
        Write-Host "$($svc.Name): liberado puerto $($svc.Port) (PID $listenerPid)."
      } catch {
        Write-Host "$($svc.Name): no se pudo detener PID $listenerPid en puerto $($svc.Port)."
      }
    }
  }
}

function Check-Url {
  param([string]$Name, [string]$Url)
  try {
    $resp = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 6
    Write-Host "${Name}: OK ($($resp.StatusCode)) -> $Url"
    return $true
  } catch {
    Write-Host "${Name}: DOWN -> $Url"
    return $false
  }
}

function Wait-Url {
  param([string]$Url, [int]$MaxSeconds = 30)
  $maxTries = [Math]::Max(1, [int]($MaxSeconds / 2))
  for ($i = 0; $i -lt $maxTries; $i++) {
    try {
      $null = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 3
      return $true
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  return $false
}

function Ensure-NodeModules {
  param([string]$ProjectPath, [string]$Label)
  $nm = Join-Path $ProjectPath "node_modules"
  if (Test-Path $nm) { return }
  Write-Host "${Label}: instalando dependencias npm..."
  Push-Location $ProjectPath
  try {
    & npm.cmd install | Out-Null
  } finally {
    Pop-Location
  }
}

function Action-Down {
  Stop-FromPidFile -Name "Backend" -PidFile $backendPidFile
  Stop-FromPidFile -Name "Client" -PidFile $clientPidFile
  Stop-FromPidFile -Name "Staff" -PidFile $staffPidFile
  Stop-StaleListeners
}

function Action-Status {
  $ok1 = Check-Url -Name "Backend" -Url "http://localhost:8000/health"
  $ok2 = Check-Url -Name "Client" -Url "http://localhost:5173"
  $ok3 = Check-Url -Name "Staff" -Url "http://localhost:5174"
  if (-not ($ok1 -and $ok2 -and $ok3)) {
    exit 1
  }
}

function Action-Up {
  Action-Down

  $pythonCommand = Resolve-PythonCommand
  Ensure-EnvFile -ProjectPath $clientPath
  Ensure-EnvFile -ProjectPath $staffPath
  Ensure-NodeModules -ProjectPath $clientPath -Label "Client"
  Ensure-NodeModules -ProjectPath $staffPath -Label "Staff"

  $backendProc = Start-Process -FilePath $pythonCommand -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000" -WorkingDirectory $backendPath -RedirectStandardOutput (Join-Path $logsDir "backend.out.log") -RedirectStandardError (Join-Path $logsDir "backend.err.log") -PassThru
  $clientProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm.cmd run dev -- --host 0.0.0.0 --port 5173" -WorkingDirectory $clientPath -RedirectStandardOutput (Join-Path $logsDir "front-client.out.log") -RedirectStandardError (Join-Path $logsDir "front-client.err.log") -PassThru
  $staffProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm.cmd run dev -- --host 0.0.0.0 --port 5174" -WorkingDirectory $staffPath -RedirectStandardOutput (Join-Path $logsDir "front-staff.out.log") -RedirectStandardError (Join-Path $logsDir "front-staff.err.log") -PassThru

  Write-PidFile -Path $backendPidFile -ProcessId $backendProc.Id
  Write-PidFile -Path $clientPidFile -ProcessId $clientProc.Id
  Write-PidFile -Path $staffPidFile -ProcessId $staffProc.Id

  $backendUp = Wait-Url -Url "http://localhost:8000/health" -MaxSeconds 40
  $clientUp = Wait-Url -Url "http://localhost:5173" -MaxSeconds 40
  $staffUp = Wait-Url -Url "http://localhost:5174" -MaxSeconds 40

  Write-Host "Servicios iniciados."
  $null = Check-Url -Name "Backend" -Url "http://localhost:8000/health"
  $null = Check-Url -Name "Client" -Url "http://localhost:5173"
  $null = Check-Url -Name "Staff" -Url "http://localhost:5174"
  Write-Host "Logs en: $logsDir"

  if (-not ($backendUp -and $clientUp -and $staffUp)) {
    exit 1
  }
}

function Action-Logs {
  foreach ($svc in $services) {
    $outPath = Join-Path $logsDir $svc.OutLog
    $errPath = Join-Path $logsDir $svc.ErrLog
    Write-Host "==== $($svc.Name) OUT: $outPath ===="
    if (Test-Path $outPath) { Get-Content $outPath -Tail 20 } else { Write-Host "Sin log OUT." }
    Write-Host "==== $($svc.Name) ERR: $errPath ===="
    if (Test-Path $errPath) { Get-Content $errPath -Tail 20 } else { Write-Host "Sin log ERR." }
  }
}

function Action-Doctor {
  $hasError = $false

  Write-Host "[doctor] Estructura de workspace"
  foreach ($path in @($backendPath, $clientPath, $staffPath, $logsDir)) {
    if (Test-Path $path) {
      Write-Host "OK  $path"
    } else {
      Write-Host "ERR falta $path"
      $hasError = $true
    }
  }

  Write-Host "[doctor] Tooling"
  try {
    $py = Resolve-PythonCommand
    $pyVer = (Invoke-Expression "$py --version") 2>&1
    Write-Host "OK  Python: $pyVer"
  } catch {
    Write-Host "ERR Python no disponible"
    $hasError = $true
  }

  try {
    $nodeVer = (& node --version) 2>&1
    Write-Host "OK  Node: $nodeVer"
  } catch {
    Write-Host "ERR Node no disponible"
    $hasError = $true
  }

  try {
    $npmVer = (& npm.cmd --version) 2>&1
    Write-Host "OK  npm: $npmVer"
  } catch {
    Write-Host "ERR npm no disponible"
    $hasError = $true
  }

  Ensure-EnvFile -ProjectPath $clientPath
  Ensure-EnvFile -ProjectPath $staffPath
  Write-Host "[doctor] Env local asegurado en ambos fronts."

  $dbPath = Join-Path $backendPath "comanda_dev.db"
  if (-not (Test-Path $dbPath)) {
    Write-Host "ERR DB no encontrada en $dbPath"
    $hasError = $true
  } else {
    Write-Host "OK  DB encontrada: $dbPath"
    try {
      $py = Resolve-PythonCommand
      $probe = @'
import sqlite3
conn = sqlite3.connect("comanda_dev.db")
cur = conn.cursor()
tables = ["stores","staff_accounts","menu_categories","products"]
for t in tables:
    n = cur.execute(f"select count(*) from {t}").fetchone()[0]
    print(f"{t}={n}")
conn.close()
'@
      Push-Location $backendPath
      try {
        $result = $probe | & $py - 2>&1
      } finally {
        Pop-Location
      }
      $text = ($result | Out-String).Trim()
      if ($text) { Write-Host $text }
      if ($text -notmatch "stores=\d+" -or $text -match "stores=0" -or $text -match "products=0" -or $text -match "staff_accounts=0") {
        Write-Host "ERR Datos minimos faltantes. Ejecutar: python scripts/init_db.py"
        $hasError = $true
      } else {
        Write-Host "OK  Seed minimo presente."
      }
    } catch {
      Write-Host "ERR No se pudo validar contenido de DB."
      $hasError = $true
    }
  }

  Write-Host "[doctor] Endpoints actuales"
  $null = Check-Url -Name "Backend" -Url "http://localhost:8000/health"
  $null = Check-Url -Name "Client" -Url "http://localhost:5173"
  $null = Check-Url -Name "Staff" -Url "http://localhost:5174"

  if ($hasError) { exit 2 }
}

if ($Action -eq "start") { $Action = "up" }
if ($Action -eq "stop") { $Action = "down" }

switch ($Action) {
  "up" { Action-Up; break }
  "down" { Action-Down; break }
  "status" { Action-Status; break }
  "restart" { Action-Down; Action-Up; break }
  "logs" { Action-Logs; break }
  "doctor" { Action-Doctor; break }
}
