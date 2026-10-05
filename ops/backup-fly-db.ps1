# Downloads a manual backup of the Fly Postgres database `sala` to this PC, at no cost.
# Usage (repo root, PowerShell):
#   powershell -ExecutionPolicy Bypass -File ops\backup-fly-db.ps1 [output folder]
# Default folder: backups\ at the repo root (gitignored); dumps older than 30 days are removed.
# Runs daily through the Windows scheduled task "Sala DB backup" (ops\schedule-fly-db-backup.ps1). The file is a pg_dump custom-format archive:
#   sala-YYYYMMDD-HHMMSS.dump
# Restore into an empty database with:
#   pg_restore --no-owner --no-privileges -d <url> <file>
# How: pg_dump runs inside the DB machine over `fly ssh`, then `fly ssh sftp get` downloads the file
# and the copy in the machine is removed. Nothing is printed except sizes and the local path.
# Fly also keeps daily volume snapshots (14 days); those are free under 10 GB of snapshot storage.
$ErrorActionPreference = "Stop"
$env:FLY_CONFIG_DIR = Join-Path $env:TEMP "claude\flyhome"
$dbApp = "sala-de-estudio-db"
$outDir = if ($args.Count -gt 0) { $args[0] } else { Join-Path (Split-Path $PSScriptRoot) "backups" }
$keepDays = 30
New-Item -ItemType Directory -Force $outDir | Out-Null
$name = "sala-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
$remote = "/tmp/$name"
$local = Join-Path $outDir $name

$script = "export PGPASSWORD=`"`$OPERATOR_PASSWORD`"; pg_dump -h localhost -p 5433 -U postgres -d sala -Fc -f $remote && ls -l $remote"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
$ErrorActionPreference = "Continue"
$out = (fly ssh console -a $dbApp -q -C "sh -c 'echo $b64 | base64 -d | bash'" 2>&1 | Out-String)
$code = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($code -ne 0) { Write-Host $out; throw "pg_dump in $dbApp failed." }

try {
  $ErrorActionPreference = "Continue"
  fly ssh sftp get $remote $local -a $dbApp 2>&1 | Out-Null
  $ErrorActionPreference = "Stop"
  if (-not (Test-Path $local) -or (Get-Item $local).Length -eq 0) { throw "Download failed." }
} finally {
  $ErrorActionPreference = "Continue"
  fly ssh console -a $dbApp -q -C "rm -f $remote" 2>&1 | Out-Null
  $ErrorActionPreference = "Stop"
}
# Keeps the last $keepDays days of dumps.
Get-ChildItem $outDir -Filter "sala-*.dump" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$keepDays) } | Remove-Item
Write-Host "Backup saved: $local ($([math]::Round((Get-Item $local).Length / 1KB)) KB)"
