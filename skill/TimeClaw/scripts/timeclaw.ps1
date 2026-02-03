<#
TimeClaw wrapper (Windows) for OpenClaw skill usage.

This is intentionally simple: it runs the Node CLI from this repo.

Usage examples:
  powershell -NoProfile -ExecutionPolicy Bypass -File timeclaw.ps1 snapshot --config C:\path\timeclaw.config.json
#>

$ErrorActionPreference = 'Stop'

$bootstrap = Join-Path $PSScriptRoot 'bootstrap.js'

# Default: run the CLI (no update). Pass CLI args through.
# Usage: timeclaw.ps1 <timeclaw args...>
node $bootstrap run -- @args
