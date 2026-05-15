param(
    [ValidateSet("version", "whoami", "list", "status", "link")]
    [string]$Action = "status",
    [string]$Workspace = "",
    [string]$Project = "",
    [string]$Service = ""
)

$RailwayCmd = "C:\Program Files\nodejs\npx.cmd"
$RailwayArgs = @("@railway/cli")

switch ($Action) {
    "version" {
        $RailwayArgs += "--version"
    }
    "whoami" {
        $RailwayArgs += "whoami"
    }
    "list" {
        $RailwayArgs += "list"
    }
    "status" {
        $RailwayArgs += "status"
    }
    "link" {
        $RailwayArgs += "link"
        if ($Workspace) {
            $RailwayArgs += @("-w", $Workspace)
        }
        if ($Project) {
            $RailwayArgs += @("-p", $Project)
        }
        if ($Service) {
            $RailwayArgs += @("-s", $Service)
        }
    }
}

if (-not $env:RAILWAY_TOKEN -and -not $env:RAILWAY_API_TOKEN -and $Action -ne "version") {
    Write-Error "Falta RAILWAY_TOKEN o RAILWAY_API_TOKEN en la sesion actual."
    exit 1
}

& $RailwayCmd @RailwayArgs
exit $LASTEXITCODE
