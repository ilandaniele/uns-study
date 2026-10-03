# Sets the seat photo verifier secrets without printing them.
# 1. Copy a Gemini API key (https://aistudio.google.com/apikey, free tier) to the clipboard.
# 2. Run: powershell -ExecutionPolicy Bypass -File ops\setup-verifier-secrets.ps1
# Generates a random shared VERIFIER_TOKEN, stores it on the verifier app and on the API,
# points the API at the verifier, then deploys the verifier.
$ErrorActionPreference = "Stop"
$env:FLY_CONFIG_DIR = Join-Path $env:TEMP "claude\flyhome"
$apiApp = if ($args.Count -gt 0) { $args[0] } else { "uns-study-api" }

$geminiKey = "$(Get-Clipboard -Raw)".Trim()
# Google issues keys in the classic "AIza..." format and the newer "AQ." format.
if (-not ($geminiKey -match '^(AIza|AQ\.)\S{20,}$')) { throw "Clipboard does not hold a Gemini API key (AIza... or AQ....)." }

$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = -join ($bytes | ForEach-Object { $_.ToString("x2") })

# Passed as arguments: piping to `fly secrets import` from Windows PowerShell prepends a BOM to the first name.
fly secrets set -a sala-de-estudio-verifier --stage "VERIFIER_TOKEN=$token" "GEMINI_API_KEY=$geminiKey"
if ($LASTEXITCODE -ne 0) { throw "Setting the verifier secrets failed." }
fly secrets set -a $apiApp --stage "SEAT_VERIFIER_URL=https://sala-de-estudio-verifier.fly.dev/" "SEAT_VERIFIER_TOKEN=$token"
if ($LASTEXITCODE -ne 0) { throw "Setting the API secrets failed." }
Set-Clipboard -Value " "

fly deploy -c fly.verifier.toml --remote-only
if ($LASTEXITCODE -ne 0) { throw "Verifier deploy failed." }
Write-Host "Done. Verifier deployed; API picks up SEAT_VERIFIER_URL on its next deploy (push to main)."
