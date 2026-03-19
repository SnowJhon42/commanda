param(
  [string]$OutputDir = "C:\Users\agust\OneDrive\Desktop\COMANDA\recordings"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Add-Type -AssemblyName System.Windows.Forms

$virtualScreen = [System.Windows.Forms.SystemInformation]::VirtualScreen
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputPath = Join-Path $OutputDir "comanda-demo-$timestamp.mp4"

$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffmpegPath = if ($ffmpegCommand) { $ffmpegCommand.Source } else { "C:\Users\agust\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe" }

if (-not (Test-Path $ffmpegPath)) {
  throw "ffmpeg no esta instalado o no esta accesible en PATH ni en la ruta de WinGet."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host "Grabando escritorio extendido completo..."
Write-Host "Area: X=$($virtualScreen.X) Y=$($virtualScreen.Y) W=$($virtualScreen.Width) H=$($virtualScreen.Height)"
Write-Host "Archivo: $outputPath"
Write-Host "Para cortar, volve a esta ventana y apreta q."

& $ffmpegPath `
  -f gdigrab `
  -framerate 30 `
  -offset_x $virtualScreen.X `
  -offset_y $virtualScreen.Y `
  -video_size "$($virtualScreen.Width)x$($virtualScreen.Height)" `
  -i desktop `
  -c:v libx264 `
  -preset veryfast `
  -crf 23 `
  -pix_fmt yuv420p `
  $outputPath
