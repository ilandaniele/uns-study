# Copies the secrets that lived in the Fly Postgres table app_secrets to Worker secrets, keeping the same
# values (sessions, IP hashes and push subscriptions depend on them). Nothing secret is printed.
# Usage: set the source URL in an env var for this run only, then:
#   $env:SOURCE_DATABASE_URL = "<postgres url from fly proxy>"
#   powershell -ExecutionPolicy Bypass -File ops\copy-app-secrets.ps1 [-UrlVar SOURCE_DATABASE_URL] [-Worker uns-api]
# Copies BETTER_AUTH_SECRET, IP_HASH_SALT and VAPID_PRIVATE_KEY to secrets. VAPID_PUBLIC_KEY is public:
# it is printed, add it to "vars" in apps/api/wrangler.jsonc.
param(
  [string]$UrlVar = "SOURCE_DATABASE_URL",
  [string]$Worker = "uns-api"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot
$url = [Environment]::GetEnvironmentVariable($UrlVar)
if (-not $url) { throw "Set `$env:$UrlVar to the Postgres connection URL first." }

function Read-AppSecret([string]$name) {
  $v = & psql $url -X -A -t -v ON_ERROR_STOP=1 -c "select value from app_secrets where name = '$name'"
  if ($LASTEXITCODE -ne 0) { throw "psql failed reading $name." }
  "$v".Trim()
}

Push-Location (Join-Path $repo "apps\api")
try {
  foreach ($name in @("BETTER_AUTH_SECRET", "IP_HASH_SALT", "VAPID_PRIVATE_KEY")) {
    $value = Read-AppSecret $name
    if (-not $value) { Write-Host "$name not found in app_secrets, skipped."; continue }
    $value | pnpm exec wrangler secret put $name --name $Worker | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Setting $name failed." }
    Write-Host "$name set on $Worker (length $($value.Length))."
  }
} finally {
  Pop-Location
}

$public = Read-AppSecret "VAPID_PUBLIC_KEY"
if ($public) { Write-Host "VAPID_PUBLIC_KEY (public, put it in wrangler.jsonc vars): $public" }
else { Write-Host "VAPID_PUBLIC_KEY not found in app_secrets." }
