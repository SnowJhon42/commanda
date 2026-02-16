$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\comanda-front-staff"

if (-not (Test-Path ".env.local")) {
@"
VITE_API_URL=http://localhost:8000
"@ | Set-Content -Path ".env.local" -Encoding UTF8
}

& npm.cmd install
& npm.cmd run dev -- --host 0.0.0.0 --port 5174
