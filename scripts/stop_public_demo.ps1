$ErrorActionPreference = "Stop"

param(
  [switch]$NoThrow
)

function Read-Pid {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $null }
  $raw = (Get-Content $Path -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (-not $raw) { return $null }
  $pidValue = 0
  if ([int]::TryParse($raw.Trim(), [ref]$pidValue)) { return $pidValue }
  return $null
}

function Stop-Pid {
  param([int]$Pid, [string]$Label)
  try {
    Stop-Process -Id $Pid -Force -ErrorAction Stop
    Write-Host "$Label detenido (PID $Pid)."
  } catch {
    Write-Host "$Label no estaba activo (PID $Pid)."
  }
}

try {
  $root = Split-Path -Parent $PSScriptRoot
  $logsDir = Join-Path $root "logs"
  $ngrokPidFile = Join-Path $logsDir "ngrok.pid"
  $clientEnvPath = Join-Path $root "comanda-front-client\.env.local"
  $staffEnvPath = Join-Path $root "comanda-front-staff\.env.local"

  $ngrokPid = Read-Pid -Path $ngrokPidFile
  if ($ngrokPid) {
    Stop-Pid -Pid $ngrokPid -Label "ngrok"
    Remove-Item $ngrokPidFile -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "ngrok: sin PID guardado."
  }

  $ngrokProcs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "ngrok*" }
  foreach ($proc in $ngrokProcs) {
    try { Stop-Process -Id $proc.Id -Force -ErrorAction Stop } catch {}
  }

  & "$PSScriptRoot\comanda_local.ps1" -Action down
  @(
    "NEXT_PUBLIC_API_URL=/api-proxy"
    "BACKEND_PROXY_TARGET=http://127.0.0.1:8001"
  ) | Set-Content -Path $clientEnvPath -Encoding ASCII
  @(
    "NEXT_PUBLIC_API_URL=/api-proxy"
    "BACKEND_PROXY_TARGET=http://127.0.0.1:8001"
  ) | Set-Content -Path $staffEnvPath -Encoding ASCII
} catch {
  if (-not $NoThrow) { throw }
  Write-Host "stop_public_demo: warning -> $($_.Exception.Message)"
}
