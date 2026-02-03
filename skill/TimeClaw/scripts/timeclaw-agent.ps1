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
if (-not $cmd) { throw "Usage: timeclaw-agent.ps1 <setup|backup-now|list|verify|restore|prune> ..." }

$rest = @()
if ($args.Length -gt 1) { $rest = $args[1..($args.Length-1)] }

switch ($cmd) {
  'setup' {
    # forward to CLI setup
    node $bootstrap run -- setup @rest
    break
  }
  'backup-now' {
    node $bootstrap run -- backup @rest
    break
  }
  'list' {
    node $bootstrap run -- list @rest
    break
  }
  'verify' {
    node $bootstrap run -- verify @rest
    break
  }
  'restore' {
    node $bootstrap run -- restore @rest
    break
  }
  'prune' {
    node $bootstrap run -- prune @rest
    break
  }
  'gc' {
    node $bootstrap run -- gc @rest
    break
  }
  default {
    throw "Unknown command: $cmd"
  }
}
