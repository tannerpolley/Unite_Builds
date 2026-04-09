param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("build", "smoke", "preview", "serve", "patch-history", "status")]
    [string]$Action
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (git rev-parse --show-toplevel).Trim()
Set-Location $repoRoot

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Command,
        [string]$FailureMessage
    )

    $commandName = $Command[0]
    $commandArgs = @()
    if ($Command.Count -gt 1) {
        $commandArgs = $Command[1..($Command.Count - 1)]
    }

    & $commandName @commandArgs
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

switch ($Action) {
    "build" {
        if (-not (Get-Command conda -ErrorAction SilentlyContinue)) {
            throw "Conda is required for the build action."
        }

        Invoke-CheckedCommand -Command @("conda", "run", "-n", "Unite_Builds", "python", "scripts/build_site.py") -FailureMessage "build_site.py failed."
    }

    "smoke" {
        if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
            throw "npm is required for the smoke action."
        }

        Invoke-CheckedCommand -Command @("npm", "test") -FailureMessage "npm test failed."
    }

    "preview" {
        if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
            throw "npm is required for the preview action."
        }

        Invoke-CheckedCommand -Command @("npm", "run", "preview") -FailureMessage "npm run preview failed."
    }

    "serve" {
        if (-not (Get-Command conda -ErrorAction SilentlyContinue)) {
            throw "Conda is required for the serve action."
        }

        Invoke-CheckedCommand -Command @("conda", "run", "-n", "Unite_Builds", "python", "-m", "http.server", "8000") -FailureMessage "Static server exited with an error."
    }

    "patch-history" {
        if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
            throw "npm is required for the patch-history action."
        }

        Invoke-CheckedCommand -Command @("npm", "run", "build:patch-history") -FailureMessage "npm run build:patch-history failed."
    }

    "status" {
        git status --short
    }

}
