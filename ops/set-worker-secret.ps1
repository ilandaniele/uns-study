# Stores one Worker secret straight from the clipboard, without printing it.
# Usage: powershell -ExecutionPolicy Bypass -File ops\set-worker-secret.ps1 -Name MP_ACCESS_TOKEN [-Worker uns-api]
# Copy the value first (provider dashboard or password manager). The value is piped to
# `wrangler secret put` through stdin, then the clipboard is cleared.
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Worker = "uns-api"
)
$ErrorActionPreference = "Stop"
if ($Name -notmatch '^[A-Z][A-Z0-9_]*$') { throw "Name must be an upper-case env var name." }
$repo = Split-Path $PSScriptRoot

$value = "$(Get-Clipboard -Raw)".Trim()
if (-not $value) { throw "Clipboard is empty." }

Push-Location (Join-Path $repo "apps\api")
try {
  $value | pnpm exec wrangler secret put $Name --name $Worker | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Setting $Name failed." }
} finally {
  Pop-Location
}
Set-Clipboard -Value " "
Write-Host "$Name set on $Worker (length $($value.Length)). Clipboard cleared."
