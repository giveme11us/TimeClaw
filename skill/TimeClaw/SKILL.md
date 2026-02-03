---
name: TimeClaw
description: Time Machine-like snapshots for OpenClaw data (config, memory, skills) with a browseable snapshot history, retention pruning, and restore workflows. Use to initialize a backup destination, create snapshots, list/verify/prune snapshots, and restore OpenClaw state from a point-in-time snapshot.
---

# TimeClaw

This skill wraps the **TimeClaw** system via a bootstrapper that clones/pulls the canonical repo and runs the CLI. This makes the skill self-installing and self-updating for the community.

## Config

TimeClaw uses a JSON config file (recommended): `timeclaw.config.json`.

Minimal example:

```json
{
  "dest": "D:/Backups",
  "machineId": "my-pc",
  "sourceRoot": "C:/Users/you/.openclaw",
  "includes": ["openclaw.json", "workspace/skills", "MEMORY.md", "memory"],
  "excludes": ["workspace/tmp", "media", "tmp"]
}
```

## Commands

From the repo root:

```bash
node ./src/cli.js init --dest D:/Backups --machine my-pc
node ./src/cli.js snapshot
node ./src/cli.js list
node ./src/cli.js verify <snapshotId>
node ./src/cli.js restore <snapshotId> --target ./restore-out
node ./src/cli.js prune --dry-run
```

## Notes

- Safety jail: TimeClaw only writes under `DEST/TimeClaw/`.
- Default retention is Time Machine-like (hourly/daily/weekly).
