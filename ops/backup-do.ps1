# Downloads every table of the production Durable Object database as NDJSON through
# /api/v1/__ops/export. Needs OPS_IMPORT_TOKEN (the Worker secret of the same name) in the environment.
# Usage:
#   $env:OPS_IMPORT_TOKEN = "<token>"
#   powershell -ExecutionPolicy Bypass -File ops\backup-do.ps1 -OutDir backups\do-20260101 [-Base https://saladeestudio.com.ar]
# The token is never printed. Output: one <table>.ndjson per table, blobs as { "$b64": "..." };
# ops\import-to-do.mjs restores it.
param(
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Base = "https://saladeestudio.com.ar"
)
$ErrorActionPreference = "Stop"
$token = $env:OPS_IMPORT_TOKEN
if (-not $token) { throw "Set `$env:OPS_IMPORT_TOKEN first." }
$headers = @{ Authorization = "Bearer $token" }
$api = "$($Base.TrimEnd('/'))/api/v1/__ops"

New-Item -ItemType Directory -Force $OutDir | Out-Null
$outAbs = (Resolve-Path $OutDir).Path
$utf8 = New-Object System.Text.UTF8Encoding($false)

$tables = (Invoke-RestMethod -Uri "$api/tables" -Headers $headers).tables
foreach ($t in $tables) {
  $path = Join-Path $outAbs "$($t.name).ndjson"
  $writer = New-Object System.IO.StreamWriter($path, $false, $utf8)
  $count = 0
  try {
    $after = 0
    while ($null -ne $after) {
      $page = Invoke-RestMethod -Uri "$api/export?table=$($t.name)&after=$after&limit=1000" -Headers $headers
      foreach ($row in $page.rows) {
        $writer.Write(($row | ConvertTo-Json -Compress -Depth 20))
        $writer.Write("`n")
        $count++
      }
      $after = $page.next
    }
  } finally {
    $writer.Dispose()
  }
  Write-Host "$($t.name) : $count rows"
}
Write-Host "Backup done in $outAbs"
