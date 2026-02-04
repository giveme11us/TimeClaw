<#
TimeClaw agent-first wrapper (Windows).

Goal: give OpenClaw a stable, high-level interface without requiring the user to learn the CLI.

Commands:
  timeclaw-agent.ps1 setup --dest <path> [--source <path>] [--machine <id>] [--force]
  timeclaw-agent.ps1 backup-now [--label <text>]
  timeclaw-agent.ps1 list
  timeclaw-agent.ps1 verify <snapshotId>
  timeclaw-agent.ps1 restore <snapshotId> [--target <path>] [--dry-run]
  timeclaw-agent.ps1 prune [--dry-run]
  timeclaw-agent.ps1 gc [--dry-run]

Config:
- Uses ./timeclaw.config.json in the current working directory.
#>

$ErrorActionPreference = 'Stop'

$bootstrap = Join-Path $PSScriptRoot 'bootstrap.js'

$cmd = $args[0]
function Show-Usage {
  Write-Error "Usage: timeclaw-agent.ps1 <setup|backup-now|list|verify|restore|prune|gc> ..."
  Write-Error "Next:  timeclaw-agent.ps1 setup --dest <path>"
}

function Invoke-TimeClaw {
  param([string[]]$Args)
  node $bootstrap run -- @Args
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $cmd) {
  Show-Usage
  exit 2
}

$rest = @()
if ($args.Length -gt 1) { $rest = $args[1..($args.Length-1)] }

switch ($cmd) {
  'setup' {
    # forward to CLI setup
    $argsList = @('setup') + $rest
    Invoke-TimeClaw $argsList
    break
  }
  'backup-now' {
    $argsList = @('backup') + $rest
    Invoke-TimeClaw $argsList
    break
  }
  'list' {
    $argsList = @('list') + $rest
    Invoke-TimeClaw $argsList
    break
  }
  'verify' {
    $argsList = @('verify') + $rest
    Invoke-TimeClaw $argsList
    break
  }
  'restore' {
    $argsList = @('restore') + $rest
    Invoke-TimeClaw $argsList
    break
  }
  'prune' {
    $argsList = @('prune') + $rest
    Invoke-TimeClaw $argsList
    break
  }
  'gc' {
    $argsList = @('gc') + $rest
    Invoke-TimeClaw $argsList
    break
  }
  default {
    Show-Usage
    Write-Error "Unknown command: $cmd"
    exit 2
  }
}
