# Applies the pending migrations of this checkout to the production database (Fly Postgres `sala`).
# Usage (repo root, PowerShell):
#   powershell -ExecutionPolicy Bypass -File ops\migrate-fly-db.ps1
# The API runtime only holds the least-privilege role sala_app and never runs DDL. On boot it just
# checks that every migration is applied and refuses to start if not, so Fly's bluegreen deploy
# keeps the previous version. Hence: a commit that changes the schema must run this script BEFORE
# pushing/deploying. Migrations must stay backward compatible with the code that is still running
# (add columns/tables; do not drop or rename what the old version reads) until the deploy finishes.
# How: sala_owner has no login. This script gives it a random one-time password over `fly ssh`,
# opens `fly proxy` to the DB, runs `pnpm db:migrate` with that URL in that child process only,
# then stops the proxy and makes sala_owner NOLOGIN again (also if the migration failed).
# It also grants sala_app read access to the `drizzle` schema, which the boot check needs.
# Nothing secret is printed: only the migration output and OK/failed.
$ErrorActionPreference = "Stop"
$env:FLY_CONFIG_DIR = Join-Path $env:TEMP "claude\flyhome"
$dbApp = "sala-de-estudio-db"
$repoRoot = Split-Path $PSScriptRoot
$proxyPort = 15433

function Invoke-DbSql([string]$sqlText, [string]$marker) {
  $script = @"
set -euo pipefail
export PGPASSWORD="`$OPERATOR_PASSWORD"
psql -h localhost -p 5433 -U postgres -d sala -v ON_ERROR_STOP=1 -q <<'SQL'
$sqlText
SQL
echo $marker
"@
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($script -replace "`r`n", "`n")))
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $out = (fly ssh console -a $dbApp -q -C "sh -c 'echo $b64 | base64 -d | bash'" 2>&1 | Out-String)
  $ErrorActionPreference = $prev
  return ($out -match $marker)
}

$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$pw = -join ($bytes | ForEach-Object { $_.ToString("x2") })

$proxy = $null
$ok = $false
try {
  Write-Host "Enabling sala_owner for this run..."
  $enable = @"
ALTER ROLE sala_owner LOGIN PASSWORD '$pw';
GRANT USAGE ON SCHEMA drizzle TO sala_app;
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO sala_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sala_owner IN SCHEMA drizzle GRANT SELECT ON TABLES TO sala_app;
"@
  if (-not (Invoke-DbSql $enable "ENABLE_OK")) { throw "Could not enable sala_owner." }

  Write-Host "Opening proxy to $dbApp..."
  $proxy = Start-Process fly -ArgumentList "proxy", "${proxyPort}:5432", "-a", $dbApp -PassThru -WindowStyle Hidden
  $ready = $false
  for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
    Start-Sleep -Seconds 1
    if ($proxy.HasExited) { throw "fly proxy exited early." }
    $client = New-Object Net.Sockets.TcpClient
    try { $client.Connect("127.0.0.1", $proxyPort); $ready = $true } catch { } finally { $client.Close() }
  }
  if (-not $ready) { throw "fly proxy did not open port $proxyPort." }

  Write-Host "Running migrations..."
  Push-Location $repoRoot
  $env:DATABASE_URL = "postgres://sala_owner:$pw@localhost:${proxyPort}/sala?sslmode=disable"
  try {
    $ErrorActionPreference = "Continue"
    pnpm db:migrate 2>&1 | ForEach-Object { Write-Host $_ }
    $code = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($code -ne 0) { throw "Migration failed." }
    $ok = $true
  } finally {
    Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
    Pop-Location
  }
} catch {
  Write-Host $_.Exception.Message
} finally {
  if ($proxy -and -not $proxy.HasExited) { Stop-Process -Id $proxy.Id -Force -ErrorAction SilentlyContinue }
  Write-Host "Disabling sala_owner login..."
  if (-not (Invoke-DbSql "ALTER ROLE sala_owner NOLOGIN PASSWORD NULL;" "DISABLE_OK")) {
    Write-Host "WARNING: could not disable sala_owner. Run: ALTER ROLE sala_owner NOLOGIN PASSWORD NULL; as postgres."
    $ok = $false
  }
}
if ($ok) { Write-Host "OK: migrations applied." } else { Write-Host "failed."; exit 1 }
