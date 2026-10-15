# One-shot data cutover from Fly to Cloudflare (checklist step 6, items 1-5). Nothing secret is printed.
#   powershell -ExecutionPolicy Bypass -File ops\cutover.ps1
# Needs `fly` logged in to the account that owns the apps and `wrangler login` done.
# Does, in order:
#   1. reads DATABASE_URL from the running Fly API (fly ssh, kept in memory only);
#   2. deploys uns-api with MAINTENANCE_MODE=1 and checks it on its workers.dev URL;
#   3. sets a fresh random OPS_IMPORT_TOKEN on the Worker and waits until it is accepted;
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
# A new version reaches the running Durable Object only after it restarts, which can take minutes.
function WaitStatus([string]$url, [int]$want, [int]$seconds = 600) {
  $deadline = (Get-Date).AddSeconds($seconds); $got = 0
  while ((Get-Date) -lt $deadline) {
    $got = Status $url
    if ($got -eq $want) { return $got }
    Start-Sleep -Seconds 5
  }
  $got
}

# Retries: a network blip during the upload ("fetch failed") must not abort the cutover.
function Wrangler([string]$argLine) {
  for ($try = 1; $try -le 4; $try++) {
    Push-Location $apiDir
    try { $out = cmd /c "pnpm exec wrangler $argLine 2>&1"; $code = $LASTEXITCODE } finally { Pop-Location }
    $out | ForEach-Object { Write-Host $_ }
    if ($code -eq 0) { return ($out -join "`n") }
    if ($try -lt 4) { Write-Host "wrangler failed, retry $try of 3 in 10s..." -ForegroundColor Yellow; Start-Sleep -Seconds 10 }
  }
  Fail "wrangler $argLine failed."
}

$machines = @()
$frozen = $false
$proxy = $null
$secretFile = $null
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

  Step "2. Deploy $Worker in maintenance"
  $out = Wrangler "deploy --var MAINTENANCE_MODE:1"
  $m = [regex]::Match($out, "https://$Worker\.[a-z0-9-]+\.workers\.dev")
  if (-not $m.Success) { Fail "workers.dev URL not found in the deploy output." }
  $base = $m.Value
  Write-Host "Worker: $base"
  $h = WaitStatus "$base/api/v1/health" 200; $p = WaitStatus "$base/api/v1/auth-providers" 503
  Write-Host "health=$h auth-providers=$p (expect 200 / 503)"
  if ($h -ne 200 -or $p -ne 503) { Fail "Worker is not healthy and in maintenance." }

  Step "3. Fresh OPS_IMPORT_TOKEN on $Worker"
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  # No stdin pipe: a short-lived JSON file (UTF-8, no BOM) fed to `secret bulk`, deleted right after.
  $secretFile = Join-Path $env:TEMP ("uns-ops-" + [guid]::NewGuid().ToString("N") + ".json")
  [IO.File]::WriteAllText($secretFile, "{""OPS_IMPORT_TOKEN"":""$token""}", (New-Object System.Text.UTF8Encoding $false))
  Push-Location $apiDir
  try {
    for ($try = 1; $try -le 4; $try++) {
      $null = cmd /c "pnpm exec wrangler secret bulk ""$secretFile"" --name $Worker 2>&1"; $code = $LASTEXITCODE
      if ($code -eq 0) { break }
      Start-Sleep -Seconds 10
    }
  }
  finally { Pop-Location; Remove-Item $secretFile -Force -ErrorAction SilentlyContinue }
  if ($code -ne 0) { Fail "Setting OPS_IMPORT_TOKEN failed (Fly untouched)." }
  Write-Host "Set."

  # The secret change rolls out a new version; wait until the Durable Object accepts the token.
  $ok = $false; $last = 0; $diag = ""
  Write-Host "Waiting for the Durable Object to pick up the new token (up to 10 min)..."
  for ($i = 0; $i -lt 120 -and -not $ok; $i++) {
    Start-Sleep -Seconds 5
    try {
      $r = Invoke-WebRequest -Uri "$base/api/v1/__ops/tables" -Headers @{ authorization = "Bearer $token" } -UseBasicParsing -TimeoutSec 20
      $last = $r.StatusCode; $ok = $last -eq 200
    } catch {
      if ($_.Exception.Response) {
        $last = [int]$_.Exception.Response.StatusCode
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $diag = $_.ErrorDetails.Message }
      }
    }
  }
  if (-not $ok) {
    $mine = -join ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($token))[0..3] | ForEach-Object { $_.ToString("x2") })
    Write-Host "Sent token: length $($token.Length) sha8 $mine. Worker said: $diag"
    Fail "Worker does not accept the new OPS_IMPORT_TOKEN, last status $last (Fly untouched)."
  }
  if ((Status "$base/api/v1/auth-providers") -ne 503) { Fail "Worker left maintenance after the secret change (Fly untouched)." }
  Write-Host "Token accepted, still in maintenance."

  Step "4. Freeze Fly API (autostart off, stop)"
  $frozen = $true
  foreach ($id in $machines) {
    & fly machine update $id -a $FlyApi --autostart=false --skip-health-checks --yes | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Disabling autostart on $id failed." }
    & fly machine stop $id -a $FlyApi | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Stopping $id failed." }
  }
  # `fly machine stop` returns while the machine is still "stopping"; wait for the final state.
  $still = @()
  for ($i = 0; $i -lt 30; $i++) {
    $still = @(& fly machine list -a $FlyApi --json | ConvertFrom-Json | Where-Object { $_.state -ne "stopped" })
    if ($still.Count -eq 0) { break }
    Start-Sleep -Seconds 3
  }
  if ($still.Count -gt 0) { Fail "Fly API machines not all stopped: $(($still | ForEach-Object { "$($_.id)=$($_.state)" }) -join ', ')." }
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
  $h = WaitStatus "$base/api/v1/health" 200; $p = WaitStatus "$base/api/v1/auth-providers" 200
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
  if ($secretFile) { Remove-Item $secretFile -Force -ErrorAction SilentlyContinue }
  $dbUrl = $null; $localUrl = $null; $token = $null
}
