# One-shot data cutover from Fly to Cloudflare (checklist step 6, items 1-5). Nothing secret is printed.
#   powershell -ExecutionPolicy Bypass -File ops\cutover.ps1
# Needs `fly` logged in to the account that owns the apps and `wrangler login` done.
# Does, in order:
#   1. reads DATABASE_URL from the running Fly API (fly ssh, kept in memory only);
#   2. sets a fresh random OPS_IMPORT_TOKEN on the Worker;
#   3. deploys uns-api with MAINTENANCE_MODE=1 and checks it on its workers.dev URL;
#   4. freezes the Fly API: autostart off, machines stopped (not destroyed);
#   5. exports Fly Postgres through `fly proxy` and imports it into the Durable Object (replace mode);
#   6. deploys uns-api without maintenance and checks health.
# Any failure after step 4 restores the Fly API (autostart on, machines started).
# DNS still points at Fly afterwards: flipping the records to Proxied and merging to main come next.
param(
  [string]$FlyApi = "uns-study-api",
  [string]$FlyDb = "sala-de-estudio-db",
  [string]$Worker = "uns-api",
  [int]$ProxyPort = 15432
)
$ErrorActionPreference = "Continue"
$repo = Split-Path $PSScriptRoot
$apiDir = Join-Path $repo "apps\api"
if (-not $env:FLY_CONFIG_DIR) {
  $flyHome = Join-Path $env:TEMP "claude\flyhome"
  if (Test-Path (Join-Path $flyHome "config.yml")) { $env:FLY_CONFIG_DIR = $flyHome }
}

function Step([string]$msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Fail([string]$msg) { throw $msg }
function Status([string]$url) {
  try { (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20).StatusCode }
  catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } }
}
function Wrangler([string]$argLine) {
  Push-Location $apiDir
  try { $out = cmd /c "pnpm exec wrangler $argLine 2>&1"; $code = $LASTEXITCODE } finally { Pop-Location }
  $out | ForEach-Object { Write-Host $_ }
  if ($code -ne 0) { Fail "wrangler $argLine failed." }
  ($out -join "`n")
}

$machines = @()
$frozen = $false
$proxy = $null
try {
  Step "Preflight"
  $machines = @(& fly machine list -a $FlyApi --json | ConvertFrom-Json | Where-Object { $_.state -eq "started" } | ForEach-Object { $_.id })
  if ($LASTEXITCODE -ne 0 -or $machines.Count -eq 0) { Fail "No started machine on $FlyApi (or fly not logged in)." }
  Write-Host "Fly API machines: $($machines -join ', ')"

  Step "1. DATABASE_URL from $FlyApi"
  $dbUrl = ("$(& fly ssh console -a $FlyApi -q -C 'printenv DATABASE_URL')" -replace "`r|`n", "").Trim()
  if (-not $dbUrl -or $dbUrl -notmatch '^postgres(ql)?://') { Fail "Could not read DATABASE_URL from $FlyApi." }
  # Same credentials, through the local proxy: replace host:port after the last '@'.
  $localUrl = $dbUrl -replace '@[^@/]+/', "@localhost:$ProxyPort/"
  Write-Host "Read (length $($dbUrl.Length))."

  Step "2. Fresh OPS_IMPORT_TOKEN on $Worker"
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  Push-Location $apiDir
  try { $token | pnpm exec wrangler secret put OPS_IMPORT_TOKEN --name $Worker | Out-Null; $code = $LASTEXITCODE } finally { Pop-Location }
  if ($code -ne 0) { Fail "Setting OPS_IMPORT_TOKEN failed." }
  Write-Host "Set."

  Step "3. Deploy $Worker in maintenance"
  $out = Wrangler "deploy --var MAINTENANCE_MODE:1"
  $m = [regex]::Match($out, "https://$Worker\.[a-z0-9-]+\.workers\.dev")
  if (-not $m.Success) { Fail "workers.dev URL not found in the deploy output." }
  $base = $m.Value
  Write-Host "Worker: $base"
  Start-Sleep -Seconds 5
  $h = Status "$base/api/v1/health"; $p = Status "$base/api/v1/auth-providers"
  Write-Host "health=$h auth-providers=$p (expect 200 / 503)"
  if ($h -ne 200 -or $p -ne 503) { Fail "Worker is not healthy and in maintenance." }

  Step "4. Freeze Fly API (autostart off, stop)"
  $frozen = $true
  foreach ($id in $machines) {
    & fly machine update $id -a $FlyApi --autostart=false --skip-health-checks --yes | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Disabling autostart on $id failed." }
    & fly machine stop $id -a $FlyApi | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Stopping $id failed." }
  }
  $still = @(& fly machine list -a $FlyApi --json | ConvertFrom-Json | Where-Object { $_.state -ne "stopped" })
  if ($still.Count -gt 0) { Fail "Fly API machines not all stopped." }
  Write-Host "Fly API stopped. No more writes to Postgres."

  Step "5. Export Fly Postgres and import into the Durable Object"
  $proxy = Start-Process -FilePath "fly" -ArgumentList "proxy $($ProxyPort):5432 -a $FlyDb" -PassThru -WindowStyle Hidden
  $up = $false
  for ($i = 0; $i -lt 45 -and -not $up; $i++) {
    Start-Sleep -Seconds 1
    try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect("127.0.0.1", $ProxyPort); $c.Close(); $up = $true } catch {}
  }
  if (-not $up) { Fail "fly proxy to $FlyDb did not open port $ProxyPort." }
  $dir = Join-Path $env:TEMP ("uns-export-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  $env:SOURCE_DATABASE_URL = $localUrl
  try { & node (Join-Path $repo "ops\export-fly-pg.mjs") --out $dir; $code = $LASTEXITCODE }
  finally { Remove-Item Env:SOURCE_DATABASE_URL -ErrorAction SilentlyContinue }
  if ($code -ne 0) { Fail "Export failed." }
  $env:OPS_IMPORT_TOKEN = $token
  try { & node (Join-Path $repo "ops\import-to-do.mjs") --base $base --dir $dir --mode replace; $code = $LASTEXITCODE }
  finally { Remove-Item Env:OPS_IMPORT_TOKEN -ErrorAction SilentlyContinue }
  if ($code -ne 0) { Fail "Import failed or counts do not match." }

  Step "6. Deploy $Worker without maintenance"
  Wrangler "deploy" | Out-Null
  Start-Sleep -Seconds 5
  $h = Status "$base/api/v1/health"; $p = Status "$base/api/v1/auth-providers"
  Write-Host "health=$h auth-providers=$p (expect 200 / 200)"
  if ($h -ne 200 -or $p -ne 200) { Fail "Worker not serving after the final deploy." }

  Write-Host "`nCUTOVER DATA OK. Export kept in $dir. Fly API stays stopped. Next: DNS to Proxied, merge to main." -ForegroundColor Green
  $frozen = $false
} catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
  if ($frozen) {
    Write-Host "Restoring Fly API..." -ForegroundColor Yellow
    foreach ($id in $machines) {
      & fly machine update $id -a $FlyApi --autostart=true --skip-health-checks --yes | Out-Null
      & fly machine start $id -a $FlyApi | Out-Null
    }
    Write-Host "Fly API restored. Site keeps running on Fly." -ForegroundColor Yellow
  }
  exit 1
} finally {
  if ($proxy -and -not $proxy.HasExited) { Stop-Process -Id $proxy.Id -Force -ErrorAction SilentlyContinue }
  $dbUrl = $null; $localUrl = $null; $token = $null
}
