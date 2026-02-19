$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

param(
  [string]$NgrokConfig = "$env:USERPROFILE\AppData\Local\ngrok\ngrok.yml",
  [int]$WaitSeconds = 45
)

function Resolve-PythonCommand {
  param([string]$BackendPath)

  $venvPython = Join-Path $BackendPath ".venv\Scripts\python.exe"
  if (Test-Path $venvPython) { return $venvPython }

  $pythonCandidates = @(
    "C:\Users\agust\AppData\Local\Programs\Python\Python312\python.exe",
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

function Wait-Url {
  param([string]$Url, [int]$MaxSeconds = 40)
  $maxTries = [Math]::Max(1, [int]($MaxSeconds / 2))
  for ($i = 0; $i -lt $maxTries; $i++) {
    try {
      Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 3 | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  return $false
}

function Get-NgrokTunnels {
  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 5
  } catch {
    return $null
  }
}

function Resolve-TunnelUrl {
  param(
    [object]$TunnelsPayload,
    [string]$Name,
    [string]$AddrSuffix
  )
  if (-not $TunnelsPayload -or -not $TunnelsPayload.tunnels) { return $null }

  $matchByName = $TunnelsPayload.tunnels | Where-Object { $_.name -eq $Name } | Select-Object -First 1
  if ($matchByName -and $matchByName.public_url) { return $matchByName.public_url }

  $matchByAddr = $TunnelsPayload.tunnels |
    Where-Object { $_.config.addr -like "*$AddrSuffix" } |
    Select-Object -First 1
  if ($matchByAddr -and $matchByAddr.public_url) { return $matchByAddr.public_url }

  return $null
}

$root = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$backendPath = Join-Path $root "comanda-backend"
$clientPath = Join-Path $root "comanda-front-client"
$staffPath = Join-Path $root "comanda-front-staff"

$ngrokOut = Join-Path $logsDir "ngrok.out.log"
$ngrokErr = Join-Path $logsDir "ngrok.err.log"
$ngrokPid = Join-Path $logsDir "ngrok.pid"

if (-not (Test-Path $NgrokConfig)) {
  throw "No se encontro ngrok config en: $NgrokConfig"
}

$ngrokCmd = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrokCmd) {
  throw "No se encontro ngrok en PATH."
}

Write-Host "[1/6] Bajando servicios locales previos..."
& "$PSScriptRoot\stop_public_demo.ps1" -NoThrow

Write-Host "[2/6] Levantando backend..."
$python = Resolve-PythonCommand -BackendPath $backendPath
$backendProc = Start-Process -FilePath $python -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000" -WorkingDirectory $backendPath -RedirectStandardOutput (Join-Path $logsDir "backend.out.log") -RedirectStandardError (Join-Path $logsDir "backend.err.log") -PassThru
"$($backendProc.Id)" | Set-Content -Path (Join-Path $logsDir "backend.pid") -Encoding ASCII

if (-not (Wait-Url -Url "http://127.0.0.1:8000/health" -MaxSeconds $WaitSeconds)) {
  throw "Backend no respondio en http://127.0.0.1:8000/health"
}

Write-Host "[3/6] Levantando ngrok (backend/client/staff)..."
$ngrokProc = Start-Process -FilePath $ngrokCmd.Source -ArgumentList "start --all --config `"$NgrokConfig`"" -RedirectStandardOutput $ngrokOut -RedirectStandardError $ngrokErr -PassThru
"$($ngrokProc.Id)" | Set-Content -Path $ngrokPid -Encoding ASCII

$backendPublic = $null
for ($i = 0; $i -lt $WaitSeconds; $i++) {
  $tunnels = Get-NgrokTunnels
  $backendPublic = Resolve-TunnelUrl -TunnelsPayload $tunnels -Name "backend" -AddrSuffix "8000"
  if ($backendPublic) { break }
  Start-Sleep -Seconds 1
}
if (-not $backendPublic) {
  throw "No se pudo resolver URL publica de backend desde ngrok API (http://127.0.0.1:4040/api/tunnels)."
}

Write-Host "[4/6] Escribiendo NEXT_PUBLIC_API_URL en fronts..."
"NEXT_PUBLIC_API_URL=$backendPublic" | Set-Content -Path (Join-Path $clientPath ".env.local") -Encoding ASCII
"NEXT_PUBLIC_API_URL=$backendPublic" | Set-Content -Path (Join-Path $staffPath ".env.local") -Encoding ASCII

Write-Host "[5/6] Levantando cliente y staff..."
$clientProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm.cmd run dev -- -H 0.0.0.0 -p 5173" -WorkingDirectory $clientPath -RedirectStandardOutput (Join-Path $logsDir "front-client.out.log") -RedirectStandardError (Join-Path $logsDir "front-client.err.log") -PassThru
$staffProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm.cmd run dev -- -H 0.0.0.0 -p 5174" -WorkingDirectory $staffPath -RedirectStandardOutput (Join-Path $logsDir "front-staff.out.log") -RedirectStandardError (Join-Path $logsDir "front-staff.err.log") -PassThru
"$($clientProc.Id)" | Set-Content -Path (Join-Path $logsDir "front-client.pid") -Encoding ASCII
"$($staffProc.Id)" | Set-Content -Path (Join-Path $logsDir "front-staff.pid") -Encoding ASCII

if (-not (Wait-Url -Url "http://127.0.0.1:5173" -MaxSeconds $WaitSeconds)) {
  throw "Front cliente no respondio en http://127.0.0.1:5173"
}
if (-not (Wait-Url -Url "http://127.0.0.1:5174" -MaxSeconds $WaitSeconds)) {
  throw "Front staff no respondio en http://127.0.0.1:5174"
}

Write-Host "[6/6] Resolviendo URLs publicas..."
$finalTunnels = Get-NgrokTunnels
$clientPublic = Resolve-TunnelUrl -TunnelsPayload $finalTunnels -Name "client" -AddrSuffix "5173"
$staffPublic = Resolve-TunnelUrl -TunnelsPayload $finalTunnels -Name "staff" -AddrSuffix "5174"

Write-Host ""
Write-Host "PUBLIC URLS"
Write-Host "Backend: $backendPublic"
Write-Host "Cliente: $clientPublic"
Write-Host "Staff:   $staffPublic"
Write-Host ""
Write-Host "Para apagar todo:"
Write-Host "  powershell -ExecutionPolicy Bypass -File $PSScriptRoot\\stop_public_demo.ps1"
