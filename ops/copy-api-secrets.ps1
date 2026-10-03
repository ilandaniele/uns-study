# Copies the API's Fly secrets from the old app (uns-study-api) to the new one (sala-de-estudio-api)
# without printing any value. Run from the repo root in PowerShell:
#   $env:FLY_CONFIG_DIR = "$env:TEMP\claude\flyhome"; .\ops\copy-api-secrets.ps1
$ErrorActionPreference = "Stop"
$from = "uns-study-api"
$to = "sala-de-estudio-api"
$names = @(
  "DATABASE_URL", "GOOGLE_CLIENT_SECRET", "ADMIN_EMAILS",
  "R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID", "R2_BUCKET_REPORT_EVIDENCE", "R2_ENDPOINT", "R2_SECRET_ACCESS_KEY",
  "TURNSTILE_SECRET_KEY"
)
$lines = foreach ($n in $names) {
  $v = (fly ssh console -a $from -q -C "printenv $n" | Out-String).Trim()
  if (-not $v) { throw "No value for $n on $from" }
  "$n=$v"
}
($lines -join "`n") | fly secrets import -a $to --stage
Write-Host "Copied $($names.Count) secrets to $to (staged; applied on next deploy)."
