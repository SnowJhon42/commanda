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
} catch {
  if (-not $NoThrow) { throw }
  Write-Host "stop_public_demo: warning -> $($_.Exception.Message)"
}
