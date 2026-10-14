# Exports every table of the Fly Postgres database to one NDJSON file per table (row_to_json),
# the input of ops\import-to-do.mjs. Skips app_secrets (see ops\copy-app-secrets.ps1) and the
# socket.io adapter table. Nothing secret is printed.
# Usage: open `fly proxy` to the DB yourself, put its URL in an env var for this run only, then:
#   $env:SOURCE_DATABASE_URL = "<postgres url through the proxy>"
#   powershell -ExecutionPolicy Bypass -File ops\export-fly-pg.ps1 -OutDir C:\path\export [-UrlVar SOURCE_DATABASE_URL]
# Tables come from the database itself (public schema). A table the new schema does not have is
# rejected by the import, which is the signal to look.
param(
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$UrlVar = "SOURCE_DATABASE_URL"
)
$ErrorActionPreference = "Stop"
$url = [Environment]::GetEnvironmentVariable($UrlVar)
if (-not $url) { throw "Set `$env:$UrlVar to the Postgres connection URL first." }
$skip = @("app_secrets", "socket_io_attachments", "__drizzle_migrations")

New-Item -ItemType Directory -Force $OutDir | Out-Null
$outAbs = (Resolve-Path $OutDir).Path

$names = & psql $url -X -A -t -v ON_ERROR_STOP=1 -c "select tablename from pg_tables where schemaname = 'public' order by tablename"
if ($LASTEXITCODE -ne 0) { throw "Listing tables failed." }

foreach ($table in ($names | ForEach-Object { "$_".Trim() } | Where-Object { $_ })) {
  if ($skip -contains $table) { continue }
  if ($table -notmatch '^[a-z_][a-z0-9_]*$') { throw "Unexpected table name '$table'." }
  # psql \copy paths use forward slashes on Windows too.
  $file = (Join-Path $outAbs "$table.ndjson") -replace '\\', '/'
  & psql $url -X -v ON_ERROR_STOP=1 -c "\copy (select row_to_json(t) from `"$table`" t) to '$file'" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Export of $table failed." }
  $lines = @(Get-Content -LiteralPath (Join-Path $outAbs "$table.ndjson")).Count
  Write-Host "$table : $lines rows"
}
Write-Host "Export done in $outAbs"
