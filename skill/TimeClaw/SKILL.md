---
name: TimeClaw
description: Time Machine-like snapshots for OpenClaw data (config, memory, skills) with a browseable snapshot history (via restore), retention pruning, and restore workflows. Uses content-addressed deduplication so it works on any filesystem (including exFAT USB drives).
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

## Agent-first commands

The recommended interface is the agent wrapper scripts (they call `bootstrap.js`, which clones/pulls the canonical repo and runs the CLI).

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\timeclaw-agent.ps1 setup --dest D:\Backups
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\timeclaw-agent.ps1 backup-now --label "first"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\timeclaw-agent.ps1 list
```

macOS/Linux:

```bash
bash scripts/timeclaw-agent.sh setup --dest /Volumes/Backups
bash scripts/timeclaw-agent.sh backup-now --label "first"
bash scripts/timeclaw-agent.sh list
```

## Low-level CLI (debug)

```bash
node ./src/cli.js setup --dest D:/Backups --machine my-pc
node ./src/cli.js snapshot
node ./src/cli.js list
node ./src/cli.js verify <snapshotId>
node ./src/cli.js restore <snapshotId> --target ./restore-out
node ./src/cli.js prune --dry-run
```

## Preparing a USB destination (Windows)

If a USB stick shows up as **RAW** or has **no drive letter** (common when it was previously used as a Linux boot disk), you can wipe + format it for TimeClaw.

⚠️ **This will erase the USB drive. Ask the user for confirmation first.**

1) Identify the USB disk number:

```powershell
Get-Disk | ft Number,FriendlyName,BusType,PartitionStyle,Size,OperationalStatus -Auto
```

2) Wipe + create one exFAT partition + assign a drive letter (example: disk **2** → `T:`) and label it `timeclaw`:

```powershell
$disk = 2
$letter = 'T'
$label = 'timeclaw'

$script = @(
  "select disk $disk",
  "clean",
  "convert mbr",
  "create partition primary",
  "format fs=exfat quick label=$label",
  "assign letter=$letter"
)

$dp = Join-Path $env:TEMP 'timeclaw-usb-diskpart.txt'
$script | Set-Content -Encoding ASCII $dp

diskpart /s $dp

Get-Volume -DriveLetter $letter | ft DriveLetter,FileSystemLabel,FileSystem,Size,SizeRemaining -Auto
```

Notes:
- exFAT is recommended for portability (Windows/macOS/Linux).
- Pick a free drive letter; `T:` is just an example.

## Notes

- TimeClaw stores data under `DEST/TimeClaw/` (safety jail).
- Snapshots are "browseable" by running `restore` into a target folder (snapshots store a `manifest.json`, not a full file tree).
- Dedup uses a content-addressed object store, so it works on filesystems without hardlinks (exFAT/USB).
- Default retention is Time Machine-like (hourly/daily/weekly).
