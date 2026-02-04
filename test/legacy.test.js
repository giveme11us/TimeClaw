import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { cmdInit } from '../src/commands/init.js';
import { cmdRestore } from '../src/commands/restore.js';
import { cmdVerify } from '../src/commands/verify.js';
import { cmdList } from '../src/commands/list.js';

async function mkTempDir(prefix) {
  const d = path.join(os.tmpdir(), prefix + '-' + crypto.randomBytes(4).toString('hex'));
  await fs.mkdir(d, { recursive: true });
  return d;
}

async function writeJson(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj, null, 2));
}

async function main() {
  const dest = await mkTempDir('timeclaw-dest-legacy');
  const source = await mkTempDir('timeclaw-src-legacy');

  // fake openclaw structure
  await fs.mkdir(path.join(source, 'memory'), { recursive: true });
  await fs.writeFile(path.join(source, 'openclaw.json'), '{"hello":true}\n');
  await fs.writeFile(path.join(source, 'memory', '2026-01-01.md'), 'legacy\n');

  const cfgPath = path.join(source, 'timeclaw.config.json');
  await writeJson(cfgPath, {
    dest,
    machineId: 'legacy-machine',
    sourceRoot: source,
    includes: ['openclaw.json', 'memory'],
    excludes: ['tmp']
  });

  await cmdInit({ flags: { dest, machine: 'legacy-machine', config: cfgPath } });

  // create a legacy snapshot tree (no manifest, no objects)
  const snapshotId = '2026-02-01T00-00-00.000Z';
  const snapDir = path.join(dest, 'TimeClaw', 'machines', 'legacy-machine', 'snapshots', snapshotId);
  await fs.mkdir(path.join(snapDir, 'memory'), { recursive: true });
  await fs.writeFile(path.join(snapDir, 'openclaw.json'), '{"hello":true}\n');
  await fs.writeFile(path.join(snapDir, 'memory', '2026-01-01.md'), 'legacy\n');

  // list should not crash and should label legacy
  await cmdList({ flags: { config: cfgPath } });

  // restore should copy from tree
  const target = path.join(source, 'restore-legacy');
  await cmdRestore({ snapshotId, flags: { config: cfgPath, target } });

  const restored = await fs.readFile(path.join(target, 'memory', '2026-01-01.md'), 'utf8');
  if (restored.trim() !== 'legacy') throw new Error('legacy restore failed');

  // migrate via verify
  await cmdVerify({ snapshotId, flags: { config: cfgPath, migrate: true } });

  const manifestPath = path.join(snapDir, 'manifest.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  if (!manifest.sha256 || !manifest.sha256['openclaw.json']) throw new Error('legacy migrate missing manifest entries');

  console.log('LEGACY_OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
