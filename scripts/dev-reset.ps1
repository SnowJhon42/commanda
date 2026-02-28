Param(
    [switch]$Start
)

$ErrorActionPreference = "Stop"

function Get-PidsByPort {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $lines = netstat -ano -p tcp | Select-String ":$Port"
    if (-not $lines) {
        return @()
    }

    $pids = @()
    foreach ($line in $lines) {
        $text = ($line -replace "\s+", " ").Trim()
        $parts = $text.Split(" ")
        if ($parts.Length -ge 5) {
            $pidRaw = $parts[$parts.Length - 1]
            if ($pidRaw -match "^\d+$") {
                $pids += [int]$pidRaw
            }
        }
    }

    return $pids | Sort-Object -Unique
}

function Stop-PortProcesses {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $pids = Get-PidsByPort -Port $Port
    if ($pids.Count -eq 0) {
        Write-Host "Port $Port: sin procesos activos."
        return
    }

    foreach ($pid in $pids) {
        try {
            taskkill /PID $pid /F | Out-Null
            Write-Host "Port $Port: proceso $pid finalizado."
        } catch {
            Write-Warning "Port $Port: no se pudo finalizar PID $pid. $_"
        }
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$npmCmd = "C:\Program Files\nodejs\npm.cmd"

if (-not (Test-Path $npmCmd)) {
    throw "No se encontro npm en '$npmCmd'."
}

Write-Host "Reiniciando puertos de desarrollo..."
Stop-PortProcesses -Port 5173
Stop-PortProcesses -Port 5174

if ($Start) {
    Write-Host "Levantando client y staff..."

    Start-Process -FilePath $npmCmd `
        -ArgumentList "run dev:client" `
        -WorkingDirectory $repoRoot

    Start-Process -FilePath $npmCmd `
        -ArgumentList "run dev:staff" `
        -WorkingDirectory $repoRoot

    Write-Host "Listo. URLs esperadas:"
    Write-Host "- Cliente: http://localhost:5173"
    Write-Host "- Staff:   http://localhost:5174"
} else {
    Write-Host "Puertos limpiados. Usa -Start para levantar servicios."
}
