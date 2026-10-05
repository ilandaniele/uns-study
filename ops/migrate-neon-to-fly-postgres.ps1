# Moves the API's database from Neon to a self-managed Fly Postgres app, without printing any secret.
# Usage (repo root, PowerShell), with the Neon OWNER connection string (Neon > Connect, neondb_owner)
# on the clipboard:
#   powershell -ExecutionPolicy Bypass -File ops\migrate-neon-to-fly-postgres.ps1
# Steps: creates the Fly Postgres app (gru, 1 node, 1 GB volume, no scale-to-zero), creates the owner
# role `sala_owner`, the database `sala` and the least-privilege role `sala_app`, copies Neon into it
# with pg_dump, compares row counts per table, then stages MIGRATION_DATABASE_URL / DATABASE_URL on
# the API and runs `fly secrets deploy`.
# Writes made to Neon between the copy and the deploy are lost: run it when nobody is using the app.
# Neon is left untouched, so rolling back is re-setting the two secrets to the Neon URLs
# (ops\set-secret-from-clipboard.ps1 migdb / db) and `fly secrets deploy`.
# Rerun with -SkipCreate if the Fly app already exists; the copy aborts if `sala` already has tables.
$ErrorActionPreference = "Stop"
$env:FLY_CONFIG_DIR = Join-Path $env:TEMP "claude\flyhome"
$api = "uns-study-api"
$dbApp = "sala-de-estudio-db"
$skipCreate = $args -contains "-SkipCreate"

# Takes the first postgres URL in the clipboard, so Neon's snippets (psql '...', DATABASE_URL=...,
# .env blocks) work too.
$clip = "$(Get-Clipboard -Raw)"
$found = [regex]::Match($clip, "postgres(ql)?://[^\s'`"]+")
$neon = $found.Value
if (-not $found.Success) {
  # Neon's "Parameters only" snippet: PGHOST='...' PGDATABASE='...' PGUSER='...' PGPASSWORD='...'
  $p = @{}
  foreach ($k in "PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD") {
    $m = [regex]::Match($clip, "$k\s*[=:]\s*['`"]?([^\s'`"]+)")
    if ($m.Success) { $p[$k] = $m.Groups[1].Value }
  }
  if ($p.Count -eq 4) {
    $neon = "postgresql://$($p.PGUSER):$([uri]::EscapeDataString($p.PGPASSWORD))@$($p.PGHOST)/$($p.PGDATABASE)?sslmode=require"
  } else {
    # Shape only, never the value: length plus the key names that were found.
    $keys = ([regex]::Matches($clip, "[A-Za-z_]{3,}(?=\s*[=:])") | ForEach-Object { $_.Value }) -join ", "
    throw "No postgres:// connection string in the clipboard (clipboard has $($clip.Length) characters; keys seen: $keys). In Neon > Connect, pick role neondb_owner, turn on 'Show password', copy, then rerun right away."
  }
}
Remove-Variable clip
if ($neon -match '^postgres(ql)?://sala_app:') { throw "That is the sala_app string. Pick role neondb_owner in Neon > Connect." }
if ($neon -match '\*{3,}') { throw "The password is masked (****). Click 'Show password' in Neon > Connect, then copy again." }
if ($neon -notmatch '^postgres(ql)?://[^:/\s]+:[^@\s]+@[^/\s]+\.neon\.tech(:\d+)?/\S+$') {
  # Shape only, never the value: tells what is wrong without leaking the password.
  $shape = $neon -replace '//([^:/]+):[^@]*@', '//$1:<password>@'
  throw "Clipboard URL is not a Neon owner string: $shape"
}

function New-Password {
  $b = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { $_.ToString("x2") })
}
$ownerPw = New-Password
$appPw = New-Password

if (-not $skipCreate) {
  Write-Host "Creating Fly Postgres app $dbApp (takes a few minutes)..."
  # Output is captured, not shown: it prints the superuser connection string.
  $ErrorActionPreference = "Continue"
  $createOut = fly postgres create --name $dbApp --org personal --region gru --initial-cluster-size 1 `
    --vm-size shared-cpu-1x --vm-memory 512 --volume-size 1 --image-ref flyio/postgres-flex:17 2>&1
  $code = $LASTEXITCODE; $ErrorActionPreference = "Stop"
  if ($code -ne 0) {
    # Show why it failed with any credential masked.
    ($createOut | Out-String) -replace 'postgres(ql)?://\S+', 'postgres://<hidden>' -replace '(?im)^(\s*password:\s*)\S+', '$1<hidden>' | Write-Host
    throw "fly postgres create failed. Check 'fly apps list' and rerun with -SkipCreate if the app exists."
  }
  Remove-Variable createOut
  Write-Host "Created $dbApp."
}

# Runs inside the Postgres machine, where the superuser password is in $OPERATOR_PASSWORD.
$sh = @"
set -euo pipefail
export PGPASSWORD="`$OPERATOR_PASSWORD"
SU="psql -h localhost -p 5433 -U postgres -v ON_ERROR_STOP=1 -qtA"
NEON='$neon'
OWNER="postgres://sala_owner:$ownerPw@localhost:5433/sala"

neon_major=`$(psql "`$NEON" -qtAc 'show server_version_num' | cut -c1-2)
local_major=`$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
if [ "`$neon_major" -gt "`$local_major" ]; then echo "Neon is Postgres `$neon_major, this image has pg_dump `$local_major. Aborting."; exit 3; fi

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
`$SU -d sala -c 'ALTER SCHEMA public OWNER TO sala_owner'
if [ "`$(psql "`$OWNER" -qtAc "select count(*) from pg_tables where schemaname in ('public','drizzle')")" != "0" ]; then
  echo "Database sala already has tables. Aborting the copy."; exit 4
fi

echo "Copying Neon into sala..."
pg_dump "`$NEON" --no-owner --no-privileges --no-publications --no-subscriptions --schema=public --schema=drizzle \
  | grep -v '^CREATE SCHEMA public;' \
  | psql "`$OWNER" -v ON_ERROR_STOP=1 -q --single-transaction > /dev/null

psql "`$OWNER" -v ON_ERROR_STOP=1 -q <<'SQL'
GRANT CONNECT ON DATABASE sala TO sala_app;
GRANT USAGE ON SCHEMA public TO sala_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sala_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sala_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sala_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sala_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sala_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sala_app;
SQL
`$SU -d postgres -c 'REVOKE CONNECT ON DATABASE sala FROM PUBLIC'

echo "Row counts (Neon / Fly):"
bad=0
for t in `$(psql "`$OWNER" -qtAc "select tablename from pg_tables where schemaname = 'public' order by 1"); do
  a=`$(psql "`$NEON" -qtAc "select count(*) from public.\"`$t\"")
  b=`$(psql "`$OWNER" -qtAc "select count(*) from public.\"`$t\"")
  [ "`$a" = "`$b" ] && m=ok || { m=DIFF; bad=1; }
  echo "  `$t `$a / `$b `$m"
done
[ "`$bad" = "0" ] || { echo "Row counts differ. Not switching."; exit 5; }
echo COPY_OK
"@
$sh = $sh -replace "`r`n", "`n"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sh))
$cmd = "sh -c 'echo $b64 | base64 -d > /tmp/m.sh && bash /tmp/m.sh; rc=`$?; rm -f /tmp/m.sh; exit `$rc'"

$out = $null
$ErrorActionPreference = "Continue"  # psql notices and fly progress go to stderr
for ($i = 1; $i -le 5; $i++) {
  $out = (fly ssh console -a $dbApp -q -C $cmd 2>&1 | Out-String)
  $code = $LASTEXITCODE
  if ($code -eq 0 -or $out -match "Aborting|differ") { break }
  Write-Host "Postgres machine not ready yet, retrying in 20 s ($i/5)..."
  Start-Sleep -Seconds 20
}
$ErrorActionPreference = "Stop"
Write-Host $out
if ($out -notmatch "COPY_OK") { throw "Copy failed. The API still uses Neon." }

$host6 = "$dbApp.internal:5432"
fly secrets set -a $api --stage `
  "MIGRATION_DATABASE_URL=postgres://sala_owner:$ownerPw@$host6/sala?sslmode=disable" `
  "DATABASE_URL=postgres://sala_app:$appPw@$host6/sala?sslmode=disable"
if ($LASTEXITCODE -ne 0) { throw "Staging the API secrets failed. The API still uses Neon." }
Remove-Variable neon, ownerPw, appPw, sh, b64, cmd
Set-Clipboard -Value " "

fly secrets deploy -a $api
if ($LASTEXITCODE -ne 0) { throw "fly secrets deploy failed." }
Write-Host "API $api now uses Fly Postgres $dbApp. Clipboard cleared."
