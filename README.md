# TimeClaw

TimeClaw is an open-source, cross-platform backup tool inspired by **macOS Time Machine**, designed for **OpenClaw** users.

The goal is a Time Machine-like experience:
- snapshots that are **browseable as full copies**
- incremental storage via reusing unchanged files (hardlinks when possible)
- Time Machine-like retention (hourly/daily/weekly) + pruning

## Install (dev)

```bash
cd timeclaw
npm test
node src/cli.js help
```

## Config (recommended)

Create `timeclaw.config.json` in your OpenClaw workspace:

```json
{
  "dest": "D:/Backups",
  "machineId": "my-pc",
  "sourceRoot": "C:/Users/you/.openclaw",
  "includes": ["openclaw.json", "workspace/skills", "MEMORY.md", "memory"],
  "excludes": ["workspace/tmp", "media", "tmp"],
  "retention": { "hourlyHours": 24, "dailyDays": 30, "weeklyWeeks": 520 }
}
```

## Commands

```bash
# init destination (writes marker under DEST/TimeClaw)
node src/cli.js init --dest D:/Backups --machine my-pc

# create snapshot (incremental best-effort)
node src/cli.js snapshot

# list snapshots
node src/cli.js list

# verify (hashes are stored for copied files)
node src/cli.js verify 2026-02-03T17-00-00.000Z

# restore snapshot to new folder
node src/cli.js restore 2026-02-03T17-00-00.000Z --target ./restore-out

# prune using Time Machine-like retention
node src/cli.js prune --dry-run
node src/cli.js prune
```

## Destination layout

TimeClaw operates only under a safe root:

```
DEST/TimeClaw/
  TIMECLAW_ROOT.json
  machines/<machineId>/
    latest.json
    snapshots/<snapshotId>/...
```

## Notes

- v0.1.0 uses a best-effort unchanged-file heuristic (size + mtime) to decide when to hardlink.
- If hardlinks are not supported, it falls back to copying.
- Cloud backends (S3, etc.) are planned for later versions.
