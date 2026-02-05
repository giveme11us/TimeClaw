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

## Agent-first quickstart

Run these from your OpenClaw workspace (the folder that contains `openclaw.json`).
Commands return JSON for machine parsing; `fsck` can emit JSON with `--json` (otherwise it prints a brief summary).

```bash
# 1) one-shot setup (creates timeclaw.config.json and initializes DEST/TimeClaw)
node src/cli.js setup --dest D:/Backups --machine my-pc

# 2) take a snapshot (incremental, content-addressed)
node src/cli.js snapshot

# 3) list snapshots (grab an id)
node src/cli.js list

# 4) verify a snapshot (rehash against objects store)
node src/cli.js verify <snapshotId>

# 5) restore a snapshot to a new folder
node src/cli.js restore <snapshotId> --target ./restore-out

# 6) prune + gc (prune removes manifests, gc removes unreferenced objects)
node src/cli.js prune
node src/cli.js gc

# 7) integrity check (CAS store)
node src/cli.js fsck --json
```

## Config (recommended)

Create `timeclaw.config.json` in your OpenClaw workspace:

```json
{
  "dest": "D:/Backups",
  "machineId": "my-pc",
  "sourceRoot": "C:/Users/you/.openclaw",
  "presets": ["openclaw"],
  "includes": ["workspace/skills/my-skill/**"],
  "excludes": ["workspace/tmp/**", "**/*.tmp"],
  "retention": { "hourlyHours": 24, "dailyDays": 30, "weeklyWeeks": 520 }
}
```

### Presets

Available presets (applied before `includes`/`excludes`):
- `openclaw`: core OpenClaw data (`openclaw.json`, `MEMORY.md`, `memory/**`, `workspace/skills/**`) with sensible excludes.
- `openclaw_all`: broader workspace capture (`workspace/**`) with extra excludes for temp and VCS folders.

If you omit `preset(s)` and `includes`/`excludes`, TimeClaw defaults to `openclaw`.

### Pattern syntax

`includes` and `excludes` are glob-like patterns relative to `sourceRoot`:
- `*` matches within a path segment, `?` matches one character, `**` matches across folders.
- A plain path like `memory` also matches everything under it.
- Trailing `/` is treated as a directory (expanded to `/**`).

Schema reference: `timeclaw.config.schema.json`

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

# garbage-collect unreferenced objects
node src/cli.js gc --dry-run
node src/cli.js gc

# integrity check (existence)
node src/cli.js fsck

# integrity check (rehash)
node src/cli.js fsck --verify-hash
```

## Maintenance: prune + gc + fsck (CAS mode)

TimeClaw uses a content-addressed store (CAS): snapshots are manifests that point to hashed objects. That means:
- `prune` deletes snapshot manifests (and their folders) based on retention rules. It does **not** delete the underlying objects.
- `gc` scans all remaining manifests, keeps referenced objects, and removes **unreferenced** objects to reclaim space.
- `fsck` validates manifest JSON, checks referenced objects exist, and can optionally rehash objects.

### Recommended workflow

```bash
# 1) preview which snapshots will be removed
node src/cli.js prune --dry-run

# 2) apply snapshot pruning
node src/cli.js prune

# 3) preview object deletions after prune
node src/cli.js gc --dry-run

# 4) reclaim space
node src/cli.js gc

# 5) verify integrity
node src/cli.js fsck
node src/cli.js fsck --verify-hash
```

### Safety notes

- Prefer `--dry-run` first. Both commands return a JSON summary so you can confirm what would be removed.
- Run `gc` only after you are confident your snapshots are complete and their `manifest.json` files exist. Objects referenced by missing or corrupt manifests will be treated as unreferenced and eligible for removal.
- If you keep snapshots for legal/restore reasons, do not run `prune` (and therefore `gc`) until you are ready to discard those snapshots.
- Run `fsck --verify-hash` before `gc` if you suspect storage corruption; it only reads data and does not mutate.

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
