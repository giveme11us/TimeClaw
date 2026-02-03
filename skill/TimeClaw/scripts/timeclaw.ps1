<#
TimeClaw wrapper (Windows) for OpenClaw skill usage.

This is intentionally simple: it runs the Node CLI from this repo.

Usage examples:
  powershell -NoProfile -ExecutionPolicy Bypass -File timeclaw.ps1 snapshot --config C:\path\timeclaw.config.json
#>

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$cli = Join-Path $repoRoot 'src\cli.js'

# Forward args to CLI
node $cli @args
