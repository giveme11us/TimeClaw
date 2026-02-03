#!/usr/bin/env bash
set -euo pipefail

# TimeClaw agent-first wrapper (macOS/Linux)
# Uses bootstrap.js to ensure the canonical repo is installed/updated and runs the CLI.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP="$SCRIPT_DIR/bootstrap.js"

cmd="${1:-}"
shift || true

case "$cmd" in
  setup)
    node "$BOOTSTRAP" run -- setup "$@"
    ;;
  backup-now)
    node "$BOOTSTRAP" run -- backup "$@"
    ;;
  list)
    node "$BOOTSTRAP" run -- list "$@"
    ;;
  verify)
    node "$BOOTSTRAP" run -- verify "$@"
    ;;
  restore)
    node "$BOOTSTRAP" run -- restore "$@"
    ;;
  prune)
    node "$BOOTSTRAP" run -- prune "$@"
    ;;
  *)
    echo "Usage: timeclaw-agent.sh {setup|backup-now|list|verify|restore|prune} ..." >&2
    exit 1
    ;;
esac
