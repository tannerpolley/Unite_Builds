[CmdletBinding()]
param(
    [switch]$Scheduled,
    [switch]$Manual,
    [switch]$NoPush,
    [switch]$NoCommit,
    [switch]$SkipSmoke
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (($Scheduled -and $Manual) -or (-not $Scheduled -and -not $Manual)) {
    throw "Provide exactly one mode: -Scheduled or -Manual."
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$StatePath = Join-Path $RepoRoot "data\tmp\unite_update_state.json"
$LogDir = Join-Path $RepoRoot "data\tmp\unite_update_logs"
$ModeName = if ($Scheduled) { "scheduled" } else { "manual" }
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogPath = Join-Path $LogDir "$Timestamp`_$ModeName.log"
$DateReaderPath = Join-Path $RepoRoot "scripts\read_unite_source_date.py"
$CaptureScriptPath = Join-Path $RepoRoot "scripts\capture_uniteapi_requests.py"
$BuildScriptPath = Join-Path $RepoRoot "scripts\build_site.py"

$CuratedPaths = @(
    "data/html",
    "data/json/uniteapi_roster.json",
    "data/csv/Unite_Meta.csv",
    "data/csv/movesets.csv",
    "data/txt/date.txt",
    "data/txt/matches.txt",
    "static/json/moveset_rows.json",
    "static/json/site_metadata.json",
    "static/json/pokemon_popup_details.json",
    "static/json/pokemon_patch_history.json",
    "static/json/pokemon_move_patch_history.json",
    "static/img/Held_Items"
)

function Ensure-Dirs {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    New-Item -ItemType Directory -Path (Split-Path $StatePath -Parent) -Force | Out-Null
}

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ssK"), $Message
    Write-Host $line
    Add-Content -Path $LogPath -Value $line
}

function To-IsoUtc {
    return (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

function Get-ItemCount {
    param($Value)
    if ($null -eq $Value) {
        return 0
    }
    return @($Value).Count
}

function Load-State {
    $default = [ordered]@{
        pending_update_cycle   = $false
        last_applied_source_date = ""
        last_checked_at        = ""
        last_success_at        = ""
    }

    if (-not (Test-Path -LiteralPath $StatePath)) {
        return $default
    }

    try {
        $raw = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8
        $parsed = $raw | ConvertFrom-Json -AsHashtable
        foreach ($key in $default.Keys) {
            if (-not $parsed.ContainsKey($key)) {
                $parsed[$key] = $default[$key]
            }
        }
        return [ordered]@{
            pending_update_cycle   = [bool]$parsed.pending_update_cycle
            last_applied_source_date = [string]$parsed.last_applied_source_date
            last_checked_at        = [string]$parsed.last_checked_at
            last_success_at        = [string]$parsed.last_success_at
        }
    } catch {
        Write-Log "State file was unreadable. Resetting to defaults."
        return $default
    }
}

function Save-State {
    param([hashtable]$State)
    $json = $State | ConvertTo-Json -Depth 5
    Set-Content -LiteralPath $StatePath -Value $json -Encoding UTF8
}

function Invoke-Tool {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Label
    )

    Write-Log $Label
    Write-Log ("Command: {0} {1}" -f $FilePath, ($Arguments -join " "))

    $output = & $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE

    foreach ($line in @($output)) {
        if ($null -ne $line) {
            $lineText = [string]$line
            Write-Host $lineText
            Add-Content -Path $LogPath -Value $lineText
        }
    }

    if ($exitCode -ne 0) {
        throw "$Label failed with exit code $exitCode."
    }

    return @($output | ForEach-Object { [string]$_ })
}

function Require-Tool {
    param([string]$ToolName)
    if (-not (Get-Command $ToolName -ErrorAction SilentlyContinue)) {
        throw "Required tool not found on PATH: $ToolName"
    }
}

function Get-GitOutput {
    param([string[]]$GitArgs)
    $lines = & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw ("git {0} failed." -f ($GitArgs -join " "))
    }
    return @($lines)
}

function Assert-GitPreconditions {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
        throw "Repo root is missing .git directory: $RepoRoot"
    }

    $origin = Get-GitOutput -GitArgs @("remote", "get-url", "origin")
    if (-not $origin -or -not $origin[0]) {
        throw "Git remote 'origin' is required."
    }

    $branchLines = @(Get-GitOutput -GitArgs @("branch", "--show-current"))
    $branch = ""
    if ((Get-ItemCount $branchLines) -gt 0) {
        $branch = [string]$branchLines[0]
    }
    $branch = $branch.Trim()
    if (-not $branch) {
        throw "Detached HEAD is not supported. Switch to main."
    }
    if ($branch -ne "main") {
        throw "Runner requires branch 'main'. Current branch: $branch"
    }

    $status = Get-GitOutput -GitArgs @("status", "--porcelain")
    if ((Get-ItemCount $status) -gt 0) {
        throw "Working tree is not clean. Commit/stash changes before running automated publish."
    }

    Invoke-Tool -FilePath "git" -Arguments @("fetch", "origin", "main") -Label "Fetching origin/main"
    Invoke-Tool -FilePath "git" -Arguments @("pull", "--ff-only", "origin", "main") -Label "Ensuring local main is fast-forwardable"
}

function Read-SourceDate {
    if (-not (Test-Path -LiteralPath $DateReaderPath)) {
        throw "Missing source date helper script: $DateReaderPath"
    }

    $output = Invoke-Tool -FilePath "conda" -Arguments @("run", "-n", "Unite_Builds", "python", $DateReaderPath, "--json") -Label "Reading source date from saved meta page"
    $jsonLine = ($output | Where-Object { $_ -match "^\s*\{.*\}\s*$" } | Select-Object -Last 1)
    if (-not $jsonLine) {
        throw "Could not parse source date JSON output."
    }
    $payload = $jsonLine | ConvertFrom-Json -AsHashtable
    $sourceDate = [string]$payload.source_date
    if ([string]::IsNullOrWhiteSpace($sourceDate)) {
        throw "Source date helper returned an empty date."
    }
    return $sourceDate.Trim()
}

Ensure-Dirs
Write-Log "Started weekly update runner in '$ModeName' mode."
Write-Log "Log file: $LogPath"

$state = Load-State
$nowIso = To-IsoUtc

try {
    Set-Location -LiteralPath $RepoRoot
    Require-Tool -ToolName "git"
    Require-Tool -ToolName "conda"
    Require-Tool -ToolName "npm"

    Assert-GitPreconditions

    $isSunday = ((Get-Date).DayOfWeek -eq [DayOfWeek]::Sunday)
    if ($isSunday -and -not [bool]$state.pending_update_cycle) {
        $state.pending_update_cycle = $true
        Write-Log "Sunday detected. Opened weekly update cycle."
    }

    if ($Scheduled -and -not $isSunday -and -not [bool]$state.pending_update_cycle) {
        $state.last_checked_at = $nowIso
        Save-State -State $state
        Write-Log "No pending weekly cycle. Scheduled run exiting."
        exit 0
    }

    if (-not (Test-Path -LiteralPath $CaptureScriptPath)) {
        throw "Missing capture script: $CaptureScriptPath"
    }

    Invoke-Tool -FilePath "conda" -Arguments @("run", "-n", "Unite_Builds", "python", $CaptureScriptPath) -Label "Running requests capture check"
    $sourceDate = Read-SourceDate
    Write-Log ("Detected source date: {0}" -f $sourceDate)

    $lastApplied = [string]$state.last_applied_source_date
    $hasUpdate = [string]::IsNullOrWhiteSpace($lastApplied) -or ($sourceDate -ne $lastApplied)

    if (-not $hasUpdate) {
        $state.pending_update_cycle = $true
        $state.last_checked_at = $nowIso
        Save-State -State $state
        Write-Log "Source date unchanged; leaving cycle pending for next scheduled check."
        exit 0
    }

    Write-Log "Source date changed (or first run). Executing full build pipeline."
    Invoke-Tool -FilePath "conda" -Arguments @("run", "-n", "Unite_Builds", "python", $BuildScriptPath) -Label "Running build pipeline"

    if (-not $SkipSmoke) {
        Invoke-Tool -FilePath "npm" -Arguments @("test") -Label "Running smoke tests"
    } else {
        Write-Log "Skipping smoke tests due to -SkipSmoke."
    }

    Invoke-Tool -FilePath "git" -Arguments (@("add", "--") + $CuratedPaths) -Label "Staging curated output paths"
    $staged = Get-GitOutput -GitArgs @("diff", "--cached", "--name-only")
    if ((Get-ItemCount $staged) -eq 0) {
        Write-Log "No staged changes after pipeline. Marking cycle complete."
        $state.pending_update_cycle = $false
        $state.last_applied_source_date = $sourceDate
        $state.last_checked_at = $nowIso
        $state.last_success_at = $nowIso
        Save-State -State $state
        exit 0
    }

    if ($NoCommit) {
        Write-Log "Skipping commit due to -NoCommit. Leaving staged changes in working tree."
        $state.pending_update_cycle = $true
        $state.last_checked_at = $nowIso
        Save-State -State $state
        exit 0
    }

    $commitMessage = "chore: weekly unite update ($sourceDate)"
    Invoke-Tool -FilePath "git" -Arguments @("commit", "-m", $commitMessage) -Label "Creating commit"

    if ($NoPush) {
        Write-Log "Skipping push due to -NoPush."
        $state.pending_update_cycle = $true
        $state.last_checked_at = $nowIso
        Save-State -State $state
        exit 0
    }

    Invoke-Tool -FilePath "git" -Arguments @("push", "origin", "main") -Label "Pushing commit to origin/main"

    $state.pending_update_cycle = $false
    $state.last_applied_source_date = $sourceDate
    $state.last_checked_at = $nowIso
    $state.last_success_at = $nowIso
    Save-State -State $state
    Write-Log "Weekly update completed successfully."
    exit 0
} catch {
    $state.pending_update_cycle = $true
    $state.last_checked_at = $nowIso
    Save-State -State $state
    Write-Log ("ERROR: {0}" -f $_.Exception.Message)
    exit 1
}
