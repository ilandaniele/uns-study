# Copies the API's generated secrets from the running Fly app to Worker secrets, keeping the same values
# (sessions, IP hashes and push subscriptions depend on them). Nothing secret is printed.
# On Fly these are Fly secrets (env vars), which win over the app_secrets table, so the env is the source.
# Usage (needs `fly` logged in to the account that owns the app, and `wrangler login`):
#   powershell -ExecutionPolicy Bypass -File ops\copy-app-secrets.ps1 [-FlyApp uns-study-api] [-Worker uns-api]
# Copies BETTER_AUTH_SECRET, IP_HASH_SALT and VAPID_PRIVATE_KEY to secrets. VAPID_PUBLIC_KEY is public:
# it is printed, add it to "vars" in apps/api/wrangler.jsonc.
param(
  [string]$FlyApp = "uns-study-api",
  [string]$Worker = "uns-api"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot

function Read-FlyEnv([string]$name) {
  $v = & fly ssh console -a $FlyApp -q -C "printenv $name"
  if ($LASTEXITCODE -ne 0) { throw "fly ssh failed reading $name." }
  ("$v" -replace "`r|`n", "").Trim()
}

Push-Location (Join-Path $repo "apps\api")
try {
  foreach ($name in @("BETTER_AUTH_SECRET", "IP_HASH_SALT", "VAPID_PRIVATE_KEY")) {
    $value = Read-FlyEnv $name
    if (-not $value) { throw "$name is not set on $FlyApp." }
    $value | pnpm exec wrangler secret put $name --name $Worker | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Setting $name failed." }
    Write-Host "$name set on $Worker (length $($value.Length))."
  }
} finally {
  Pop-Location
}

$public = Read-FlyEnv "VAPID_PUBLIC_KEY"
if ($public) { Write-Host "VAPID_PUBLIC_KEY (public, put it in wrangler.jsonc vars): $public" }
else { Write-Host "VAPID_PUBLIC_KEY is not set on $FlyApp." }
