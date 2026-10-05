# Generates a fresh PROXY_SHARED_SECRET and stages it on both Fly apps, without printing it.
# Usage: powershell -ExecutionPolicy Bypass -File ops\rotate-proxy-secret.ps1
# Staged only: deploy the web app (sala-de-estudio) FIRST, then the API (uns-study-api), so the
# web app is already sending the new secret when the API starts requiring it.
$ErrorActionPreference = "Stop"
$env:FLY_CONFIG_DIR = Join-Path $env:TEMP "claude\flyhome"

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$value = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")

# Passed as an argument: piping to `fly secrets import` from Windows PowerShell prepends a BOM.
fly secrets set -a sala-de-estudio --stage "PROXY_SHARED_SECRET=$value"
if ($LASTEXITCODE -ne 0) { throw "Setting PROXY_SHARED_SECRET on sala-de-estudio failed." }
fly secrets set -a uns-study-api --stage "PROXY_SHARED_SECRET=$value"
if ($LASTEXITCODE -ne 0) { throw "Setting PROXY_SHARED_SECRET on uns-study-api failed." }
$length = $value.Length
$value = $null
Write-Host "PROXY_SHARED_SECRET staged on sala-de-estudio and uns-study-api (length $length). Deploy web first, then API."
