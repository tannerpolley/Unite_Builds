[CmdletBinding()]
param(
    [string]$TaskName = "UniteBuilds Weekly Update",
    [string]$RunTime = "06:00"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RunnerPath = Join-Path $RepoRoot "scripts\run_unite_weekly_update.ps1"

if (-not (Test-Path -LiteralPath $RunnerPath)) {
    throw "Missing runner script: $RunnerPath"
}

$runAt = [DateTime]::Today.Add([TimeSpan]::Parse($RunTime))
$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue)

if ($pwsh) {
    $shellExe = $pwsh.Source
} else {
    $shellExe = (Get-Command powershell -ErrorAction Stop).Source
}

$actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$RunnerPath`" -Scheduled"

$action = New-ScheduledTaskAction -Execute $shellExe -Argument $actionArgs -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $runAt
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3)

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType InteractiveToken `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Runs Unite_Builds weekly update watcher at 6:00 AM; Sunday opens cycle, daily retries until update is applied." `
    -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
Write-Host "Installed/updated scheduled task:"
Write-Host ("  Name: {0}" -f $task.TaskName)
Write-Host ("  State: {0}" -f $task.State)
Write-Host ("  Action: {0} {1}" -f $shellExe, $actionArgs)
Write-Host ("  Trigger: Daily at {0}" -f $RunTime)
Write-Host ""
Write-Host "Trigger it immediately with:"
Write-Host ("  Start-ScheduledTask -TaskName `"{0}`"" -f $TaskName)
