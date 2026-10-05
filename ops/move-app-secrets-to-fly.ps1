# Copies the API's self-generated secrets from the `app_secrets` table into Fly secrets, without
# printing any value. Env vars always win over the table (see apps/api/src/secrets.ts), so after the
# next deploy the rows are unused and can be removed by hand.
# Usage (repo root, PowerShell): powershell -ExecutionPolicy Bypass -File ops\move-app-secrets-to-fly.ps1 [app]
# Then check with: ops\move-app-secrets-to-fly.ps1 [app] -Verify   (after the deploy)
$ErrorActionPreference = "Stop"
$env:FLY_CONFIG_DIR = Join-Path $env:TEMP "claude\flyhome"
$app = if ($args.Count -gt 0 -and $args[0] -notlike "-*") { $args[0] } else { "uns-study-api" }
$verify = $args -contains "-Verify"

# Runs inside the API machine, where DATABASE_URL and the `pg` driver already exist.
$readJs = @'
const { Pool } = require(require.resolve("pg", { paths: [process.cwd(), "/app/apps/api", "/app"] }));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
pool.query("select name, value from app_secrets").then(({ rows }) => {
  const by = Object.fromEntries(rows.map((r) => [r.name, r.value]));
  const out = {};
  if (by.better_auth_secret) out.BETTER_AUTH_SECRET = by.better_auth_secret;
  if (by.ip_hash_salt) out.IP_HASH_SALT = by.ip_hash_salt;
  if (by.vapid_keys) { const k = JSON.parse(by.vapid_keys); out.VAPID_PUBLIC_KEY = k.publicKey; out.VAPID_PRIVATE_KEY = k.privateKey; }
  process.stdout.write(Buffer.from(JSON.stringify(out)).toString("base64"));
  return pool.end();
});
'@

# Compares the running env against the table by hash only.
$verifyJs = @'
const { Pool } = require(require.resolve("pg", { paths: [process.cwd(), "/app/apps/api", "/app"] }));
const h = (v) => require("crypto").createHash("sha256").update(String(v ?? "")).digest("hex");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
pool.query("select name, value from app_secrets").then(({ rows }) => {
  const by = Object.fromEntries(rows.map((r) => [r.name, r.value]));
  const k = by.vapid_keys ? JSON.parse(by.vapid_keys) : {};
  const pairs = { BETTER_AUTH_SECRET: by.better_auth_secret, IP_HASH_SALT: by.ip_hash_salt, VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey };
  for (const [n, v] of Object.entries(pairs)) console.log(n, v === undefined ? "no-row" : h(process.env[n]) === h(v) ? "match" : "MISMATCH");
  return pool.end();
});
'@

$js = if ($verify) { $verifyJs } else { $readJs }
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($js))
$cmd = "sh -c 'cd /app/packages/database && echo $b64 | base64 -d > /tmp/s.cjs && node /tmp/s.cjs; rc=`$?; rm -f /tmp/s.cjs; exit `$rc'"
$raw = (fly ssh console -a $app -q -C $cmd | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "Reading app_secrets on $app failed." }
if ($verify) { Write-Host $raw; return }

$values = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($raw)) | ConvertFrom-Json
$pairs = foreach ($p in $values.PSObject.Properties) { "$($p.Name)=$($p.Value)" }
if (-not $pairs) { throw "No app_secrets rows found on $app." }
# Passed as arguments: piping to `fly secrets import` from Windows PowerShell prepends a BOM.
fly secrets set -a $app --stage @pairs
if ($LASTEXITCODE -ne 0) { throw "Staging secrets on $app failed." }
Write-Host "Staged $(@($pairs).Count) secrets on $app ($(($values.PSObject.Properties.Name) -join ', ')). Values not shown."
Remove-Variable raw, values, pairs
