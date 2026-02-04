# TimeClaw

TimeClaw is an open-source, cross-platform backup tool inspired by **macOS Time Machine**, designed for **OpenClaw** users.

The goal is a Time Machine-like experience:
- snapshots with a **browseable history** (via `restore`), designed to work on any filesystem
- incremental storage via **content-addressed deduplication** (works on exFAT/USB, no hardlinks required)
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
# one-shot setup (creates timeclaw.config.json and initializes DEST/TimeClaw)
node src/cli.js setup --dest D:/Backups --machine my-pc

# create snapshot (incremental best-effort)
node src/cli.js snapshot
# or
node src/cli.js backup

# list snapshots
node src/cli.js list

# verify (hashes are stored for copied files)
node src/cli.js verify 2026-02-03T17-00-00.000Z

# restore snapshot to new folder
node src/cli.js restore 2026-02-03T17-00-00.000Z --target ./restore-out

# migrate a legacy snapshot tree into CAS + manifest (optional)
node src/cli.js verify 2026-02-03T17-00-00.000Z --migrate
node src/cli.js restore 2026-02-03T17-00-00.000Z --migrate

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
    objects/<aa>/<sha256>         # content-addressed object store
    snapshots/<snapshotId>/
      manifest.json               # maps relPath -> sha256 (+ metadata)
```

### Browsing snapshots

With the content-addressed layout, a snapshot folder contains a `manifest.json` (not a full file tree).
To "browse" a snapshot, materialize it with:

```bash
node src/cli.js restore <snapshotId> --target ./restore-out
```

### Legacy snapshots (pre-CAS)

Older TimeClaw versions stored full file trees directly under `snapshots/<snapshotId>/` without a `manifest.json`.
Current behavior:
- `list` marks these snapshots as `legacy: true`.
- `restore` will copy files directly from the snapshot tree and prints a warning.
- `verify` cannot verify without a manifest; run with `--migrate` to convert.

`--migrate` converts a legacy snapshot tree into CAS objects plus a `manifest.json` in-place so future `verify`, `restore`, and `gc` can use it.

## Notes

- TimeClaw uses a content-addressed object store so dedup works on filesystems without hardlinks (exFAT/USB).
- `prune` removes snapshot manifests. Run `gc` to garbage-collect unreferenced objects and reclaim space.
- Cloud backends (S3, etc.) are planned for later versions.
