$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\comanda-front-staff"

if (-not (Test-Path ".env.local")) {
@"
NEXT_PUBLIC_API_URL=http://localhost:8000
"@ | Set-Content -Path ".env.local" -Encoding UTF8
}

& npm.cmd install
& npm.cmd run dev -- -H 0.0.0.0 -p 5174
