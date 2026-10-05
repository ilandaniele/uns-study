# Stores one API secret on Fly straight from the clipboard, without printing it.
# Usage: powershell -ExecutionPolicy Bypass -File ops\set-secret-from-clipboard.ps1 <kind> [app]
#   mp       -> MP_ACCESS_TOKEN    (Mercado Pago > Tus integraciones > Credenciales de produccion, "Access Token")
#   mphook   -> MP_WEBHOOK_SECRET  (Mercado Pago > Webhooks > "Clave secreta")
#   resend   -> RESEND_API_KEY     (resend.com/api-keys, "Sending access")
#   migdb    -> MIGRATION_DATABASE_URL (Neon > Connect, role neondb_owner; set this BEFORE `db`)
#   db       -> DATABASE_URL       (the least-privilege `sala_app` connection string, ops/neon-least-privilege.sql)
# The secret is staged; the API picks it up on its next deploy (push to main) or `fly secrets deploy`.
$ErrorActionPreference = "Stop"
$env:FLY_CONFIG_DIR = Join-Path $env:TEMP "claude\flyhome"
if ($args.Count -lt 1) { throw "Pass a kind: mp, mphook, resend, migdb or db." }
$kind = $args[0]
$app = if ($args.Count -gt 1) { $args[1] } else { "uns-study-api" }

$specs = @{
  mp     = @{ Name = "MP_ACCESS_TOKEN";   Pattern = '^(APP_USR|TEST)-[\w-]{20,}$' }
  mphook = @{ Name = "MP_WEBHOOK_SECRET"; Pattern = '^[A-Za-z0-9]{16,}$' }
  resend = @{ Name = "RESEND_API_KEY";    Pattern = '^re_[A-Za-z0-9_]{16,}$' }
  migdb  = @{ Name = "MIGRATION_DATABASE_URL"; Pattern = '^postgres(ql)?://(?!sala_app:)[^:/\s]+:[^@\s]+@[^/\s]+/\S+$' }
  db     = @{ Name = "DATABASE_URL";       Pattern = '^postgres(ql)?://sala_app:[^@\s]+@[^/\s]+/\S+$' }
}
if (-not $specs.ContainsKey($kind)) { throw "Unknown kind '$kind'. Use mp, mphook, resend, migdb or db." }
$spec = $specs[$kind]

$value = "$(Get-Clipboard -Raw)".Trim()
if (-not ($value -match $spec.Pattern)) { throw "Clipboard does not look like a $($spec.Name)." }

# Passed as an argument: piping to `fly secrets import` from Windows PowerShell prepends a BOM.
fly secrets set -a $app --stage "$($spec.Name)=$value"
if ($LASTEXITCODE -ne 0) { throw "Setting $($spec.Name) failed." }
Set-Clipboard -Value " "
Write-Host "$($spec.Name) staged on $app (length $($value.Length)). Clipboard cleared."
