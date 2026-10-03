# Sets the seat photo verifier secrets without printing them.
# 1. Copy a Gemini API key (https://aistudio.google.com/apikey, free tier) to the clipboard.
# 2. Run: powershell -ExecutionPolicy Bypass -File ops\setup-verifier-secrets.ps1
# Generates a random shared VERIFIER_TOKEN, stores it on the verifier app and on the API,
# points the API at the verifier, then deploys the verifier.
$ErrorActionPreference = "Stop"
$env:FLY_CONFIG_DIR = Join-Path $env:TEMP "claude\flyhome"
$apiApp = if ($args.Count -gt 0) { $args[0] } else { "uns-study-api" }

$geminiKey = (Get-Clipboard -Raw).Trim()
if (-not $geminiKey.StartsWith("AIza")) { throw "Clipboard does not hold a Gemini API key (AIza...)." }

$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = -join ($bytes | ForEach-Object { $_.ToString("x2") })

"VERIFIER_TOKEN=$token`nGEMINI_API_KEY=$geminiKey" | fly secrets import -a sala-de-estudio-verifier --stage
"SEAT_VERIFIER_URL=https://sala-de-estudio-verifier.fly.dev/`nSEAT_VERIFIER_TOKEN=$token" | fly secrets import -a $apiApp --stage
Set-Clipboard -Value " "

fly deploy -c fly.verifier.toml --remote-only
Write-Host "Done. Verifier deployed; API picks up SEAT_VERIFIER_URL on its next deploy (push to main)."
