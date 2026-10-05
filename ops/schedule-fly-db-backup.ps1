# Registers (or updates) the Windows scheduled task "Sala DB backup", which runs
# ops\backup-fly-db.ps1 every day at 13:00 for the current user, hidden.
# If the PC is off at that time, the task runs as soon as it is back on (StartWhenAvailable).
# Remove it with: Unregister-ScheduledTask -TaskName "Sala DB backup" -Confirm:$false
$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "backup-fly-db.ps1"
$log = Join-Path (Split-Path $PSScriptRoot) "backups\last-backup.log"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"& '$script' *> '$log'`""
$trigger = New-ScheduledTaskTrigger -Daily -At 13:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "Sala DB backup" -Action $action -Trigger $trigger -Settings $settings `
  -Description "Daily pg_dump of the Fly Postgres database sala into the repo's backups folder." -Force | Out-Null
Write-Host "Scheduled task 'Sala DB backup' registered: daily 13:00, log in $log"
