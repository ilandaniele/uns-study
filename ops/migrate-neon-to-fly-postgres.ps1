# Moves the API's database from Neon to a self-managed Fly Postgres app, without printing any secret.
# Usage (repo root, PowerShell):
#   powershell -ExecutionPolicy Bypass -File ops\migrate-neon-to-fly-postgres.ps1
# No clipboard needed: the Neon owner URL is read inside Fly from the API's current
# MIGRATION_DATABASE_URL secret, by an ephemeral `fly console` machine running the Postgres image.
# Steps: creates the Fly Postgres app if missing (gru, 1 node, 1 GB volume), creates the owner role
# `sala_owner`, the database `sala` and the least-privilege role `sala_app` (same grants as
# ops/neon-least-privilege.sql), copies Neon into it with pg_dump, compares row counts per table,
# then sets MIGRATION_DATABASE_URL / DATABASE_URL on the API and runs `fly secrets deploy`.
# Writes made to Neon between the copy and the deploy are lost: run it when nobody is using the app.
# Neon is left untouched, so rolling back is re-setting the two secrets to the Neon URLs
# (ops\set-secret-from-clipboard.ps1 migdb / db) and `fly secrets deploy`.
# Rerunning after a successful copy aborts, because `sala` already has tables.
$ErrorActionPreference = "Stop"
$env:FLY_CONFIG_DIR = Join-Path $env:TEMP "claude\flyhome"
$api = "uns-study-api"
$dbApp = "sala-de-estudio-db"
$pgImage = "flyio/postgres-flex:17"
# Client tools for the copy: Neon runs Postgres 18 and pg_dump refuses a newer server.
$clientImage = "postgres:18"

function New-Password {
  $b = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { $_.ToString("x2") })
}
$ownerPw = New-Password
$appPw = New-Password

# Runs a bash script given as text, passed base64-encoded so no quoting gets in the way.
function Get-ShCommand([string]$script) {
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($script -replace "`r`n", "`n")))
  "sh -c 'echo $b64 | base64 -d > /tmp/m.sh && bash /tmp/m.sh; rc=`$?; rm -f /tmp/m.sh; exit `$rc'"
}

$ErrorActionPreference = "Continue"  # fly progress and psql notices go to stderr
$exists = (fly status -a $dbApp 2>&1 | Out-String) -notmatch "Could not find App|not found"
$ErrorActionPreference = "Stop"
if (-not $exists) {
  Write-Host "Creating Fly Postgres app $dbApp (takes a few minutes)..."
  # Output is captured, not shown: it prints the superuser connection string.
  $ErrorActionPreference = "Continue"
  $createOut = fly postgres create --name $dbApp --org personal --region gru --initial-cluster-size 1 `
    --vm-size shared-cpu-1x --vm-memory 512 --volume-size 1 --image-ref $pgImage 2>&1
  $code = $LASTEXITCODE; $ErrorActionPreference = "Stop"
  if ($code -ne 0) {
    ($createOut | Out-String) -replace 'postgres(ql)?://\S+', 'postgres://<hidden>' -replace '(?im)^(\s*password:\s*)\S+', '$1<hidden>' | Write-Host
    throw "fly postgres create failed."
  }
  Remove-Variable createOut
  Write-Host "Created $dbApp."
}

# 1. Inside the Postgres machine, where the superuser password is in $OPERATOR_PASSWORD.
# Default privileges are set before the copy, so every table sala_owner creates is granted to sala_app.
$setup = @"
set -euo pipefail
export PGPASSWORD="`$OPERATOR_PASSWORD"
SU="psql -h localhost -p 5433 -U postgres -v ON_ERROR_STOP=1 -qtA"
`$SU -d postgres <<'SQL'
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sala_owner') THEN CREATE ROLE sala_owner LOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sala_app') THEN CREATE ROLE sala_app LOGIN; END IF;
END `$`$;
ALTER ROLE sala_owner PASSWORD '$ownerPw';
ALTER ROLE sala_app PASSWORD '$appPw';
SQL
if [ -z "`$(`$SU -d postgres -c "select 1 from pg_database where datname = 'sala'")" ]; then
  `$SU -d postgres -c 'CREATE DATABASE sala OWNER sala_owner'
fi
if [ "`$(`$SU -d sala -c "select count(*) from pg_tables where schemaname in ('public','drizzle')")" != "0" ]; then
  echo "Database sala already has tables. Aborting."; exit 4
fi
`$SU -d sala <<'SQL'
ALTER SCHEMA public OWNER TO sala_owner;
REVOKE CONNECT ON DATABASE sala FROM PUBLIC;
GRANT CONNECT ON DATABASE sala TO sala_owner, sala_app;
GRANT USAGE ON SCHEMA public TO sala_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sala_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sala_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sala_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sala_app;
SQL
echo SETUP_OK
"@
$out = $null
$ErrorActionPreference = "Continue"
for ($i = 1; $i -le 5; $i++) {
  $out = (fly ssh console -a $dbApp -q -C (Get-ShCommand $setup) 2>&1 | Out-String)
  if ($LASTEXITCODE -eq 0 -or $out -match "Aborting") { break }
  Write-Host "Postgres machine not ready yet, retrying in 20 s ($i/5)..."
  Start-Sleep -Seconds 20
}
$ErrorActionPreference = "Stop"
Write-Host $out
if ($out -notmatch "SETUP_OK") { throw "Setup of $dbApp failed. The API still uses Neon." }

# 2. In an ephemeral machine of the API app, which has the Neon owner URL as $MIGRATION_DATABASE_URL.
$copy = @"
set -euo pipefail
NEON="`$MIGRATION_DATABASE_URL"
OWNER="postgres://sala_owner:$ownerPw@$dbApp.internal:5432/sala?sslmode=disable"
neon_major=`$(psql "`$NEON" -qtAc 'show server_version_num' | cut -c1-2)
local_major=`$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
if [ "`$neon_major" -gt "`$local_major" ]; then echo "Neon is Postgres `$neon_major, pg_dump is `$local_major. Aborting."; exit 3; fi
echo "Copying Neon (Postgres `$neon_major) into sala..."
pg_dump "`$NEON" --no-owner --no-privileges --no-publications --no-subscriptions --schema=public --schema=drizzle \
  | grep -v '^CREATE SCHEMA public;' \
  | psql "`$OWNER" -v ON_ERROR_STOP=1 -q --single-transaction > /dev/null
echo "Row counts (Neon / Fly):"
bad=0
for t in `$(psql "`$OWNER" -qtAc "select tablename from pg_tables where schemaname = 'public' order by 1"); do
  a=`$(psql "`$NEON" -qtAc "select count(*) from public.\"`$t\"")
  b=`$(psql "`$OWNER" -qtAc "select count(*) from public.\"`$t\"")
  [ "`$a" = "`$b" ] && m=ok || { m=DIFF; bad=1; }
  echo "  `$t `$a / `$b `$m"
done
[ "`$bad" = "0" ] || { echo "Row counts differ. Not switching."; exit 5; }
n=`$(psql "postgres://sala_app:$appPw@$dbApp.internal:5432/sala?sslmode=disable" -qtAc "select count(*) from information_schema.role_table_grants where grantee = 'sala_app'")
echo "sala_app table grants: `$n"
echo COPY_OK
"@
Write-Host "Copying data (ephemeral machine in $api)..."
$ErrorActionPreference = "Continue"
$out = (fly console -a $api -i $clientImage --vm-size shared-cpu-1x -C (Get-ShCommand $copy) 2>&1 | Out-String)
$ErrorActionPreference = "Stop"
Write-Host $out
if ($out -notmatch "COPY_OK") { throw "Copy failed. The API still uses Neon." }

$host6 = "$dbApp.internal:5432"
fly secrets set -a $api --stage `
  "MIGRATION_DATABASE_URL=postgres://sala_owner:$ownerPw@$host6/sala?sslmode=disable" `
  "DATABASE_URL=postgres://sala_app:$appPw@$host6/sala?sslmode=disable"
if ($LASTEXITCODE -ne 0) { throw "Staging the API secrets failed. The API still uses Neon." }
Remove-Variable ownerPw, appPw, setup, copy

fly secrets deploy -a $api
if ($LASTEXITCODE -ne 0) { throw "fly secrets deploy failed." }
Write-Host "API $api now uses Fly Postgres $dbApp."
