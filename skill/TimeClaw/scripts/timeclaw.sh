#!/usr/bin/env bash
set -euo pipefail

# TimeClaw wrapper (macOS/Linux)
# Runs the TimeClaw bootstrapper, which ensures the repo is cloned/updated and then runs the CLI.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP="$SCRIPT_DIR/bootstrap.js"

# Default: run the CLI (no update). Pass CLI args through.
node "$BOOTSTRAP" run -- "$@"
