# Restores a dump made by ops\backup-fly-db.ps1 into the Fly Postgres app, without printing any secret.
# Usage (repo root, PowerShell):
#   powershell -ExecutionPolicy Bypass -File ops\restore-fly-db.ps1                 # latest dump -> test DB sala_restore_test
#   powershell -ExecutionPolicy Bypass -File ops\restore-fly-db.ps1 -Dump backups\sala-X.dump -Database sala -Force
# Restoring into `sala` replaces the live data with the dump (one transaction: all or nothing),
# so it needs -Force. Restoring into any other name creates that database and leaves `sala` alone,
# which is how to check that a backup is good.
# Objects are created as sala_owner, so sala_app gets its grants from the default privileges.
#
# When the DB machine crashes, Fly restarts it by itself (restart policy "always") and the data
# stays on its volume: nothing to restore. Use this script only when the data itself is lost or bad.
# If the whole volume is lost, the daily volume snapshots are the other way back:
#   fly volumes snapshots list <volume id> -a sala-de-estudio-db
#   fly volumes create pg_data --snapshot-id <id> -a sala-de-estudio-db --region gru
#   then attach it with `fly machine clone <machine id> --attach-volume <new volume id>:/data -a sala-de-estudio-db`
#   and destroy the broken machine.
param(
  [string]$Dump,
  [string]$Database = "sala_restore_test",
  [switch]$Force
)
$ErrorActionPreference = "Stop"
$env:FLY_CONFIG_DIR = Join-Path $env:TEMP "claude\flyhome"
$dbApp = "sala-de-estudio-db"
if ($Database -notmatch '^[a-z_][a-z0-9_]*$') { throw "Invalid database name '$Database'." }
if ($Database -eq "sala" -and -not $Force) { throw "Restoring into the live database 'sala' needs -Force." }
if (-not $Dump) {
  $latest = Get-ChildItem (Join-Path (Split-Path $PSScriptRoot) "backups") -Filter "sala-*.dump" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { throw "No dump found in backups\. Run ops\backup-fly-db.ps1 first." }
  $Dump = $latest.FullName
}
if (-not (Test-Path $Dump)) { throw "Dump '$Dump' not found." }
Write-Host "Restoring $Dump into $Database..."
$remote = "/tmp/restore-$([guid]::NewGuid().ToString('N')).dump"

$script = @"
set -euo pipefail
export PGPASSWORD="`$OPERATOR_PASSWORD"
SU="psql -h localhost -p 5433 -U postgres -v ON_ERROR_STOP=1 -qtA"
if [ -z "`$(`$SU -d postgres -c "select 1 from pg_database where datname = '$Database'")" ]; then
  `$SU -d postgres -c 'CREATE DATABASE $Database OWNER sala_owner'
fi
pg_restore -h localhost -p 5433 -U postgres -d $Database --role=sala_owner --no-owner --no-privileges \
  --clean --if-exists --single-transaction --exit-on-error $remote
echo "Row counts in ${Database}:"
for t in `$(`$SU -d $Database -c "select tablename from pg_tables where schemaname = 'public' order by 1"); do
  echo "  `$t `$(`$SU -d $Database -c "select count(*) from public.\"`$t\"")"
done
echo RESTORE_OK
"@
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($script -replace "`r`n", "`n")))

$ErrorActionPreference = "Continue"
try {
  fly ssh sftp put $Dump $remote -a $dbApp 2>&1 | Out-Null
  $out = (fly ssh console -a $dbApp -q -C "sh -c 'echo $b64 | base64 -d | bash'" 2>&1 | Out-String)
} finally {
  fly ssh console -a $dbApp -q -C "rm -f $remote" 2>&1 | Out-Null
  $ErrorActionPreference = "Stop"
}
Write-Host $out
if ($out -notmatch "RESTORE_OK") { throw "Restore failed. Nothing was changed (single transaction)." }
Write-Host "Restored into $Database."
