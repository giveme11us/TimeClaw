import path from 'node:path';
import fs from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { UserError } from '../errors.js';
import { snapshotsDir, objectsDir } from '../layout.js';
import { ensureDir, copyFileAtomic, pathExists, safeReadJson } from '../fsops.js';

export async function cmdRestore({ snapshotId, flags }) {
  const { config } = await loadConfig({ configPath: flags.config, requireInitialized: true });
  const dryRun = !!flags['dry-run'] || !!flags.dryRun;
  const target = flags.target ? path.resolve(flags.target) : path.resolve(process.cwd(), `timeclaw-restore-${snapshotId}`);

  const snapBase = path.join(snapshotsDir(config.dest, config.machineId), snapshotId);
  if (!(await pathExists(snapBase))) {
    throw new UserError(`Snapshot not found: ${snapshotId}`, {
      code: 'SNAPSHOT_NOT_FOUND',
      exitCode: 6,
      hint: 'Run list to see available snapshots.',
      next: 'timeclaw list'
    });
  }

  const manifestPath = path.join(snapBase, 'manifest.json');
  const manifest = await safeReadJson(manifestPath);
  const entries = Object.entries(manifest.sha256 || {});

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, snapshotId, target, files: entries.length }, null, 2));
    return;
  }

  await ensureDir(target);

  for (const [rel, hash] of entries) {
    const objPath = path.join(objectsDir(config.dest, config.machineId), String(hash).slice(0, 2), String(hash));
    if (!(await pathExists(objPath))) {
      throw new UserError(`Missing object for ${rel}`, {
        code: 'OBJECT_MISSING',
        exitCode: 6,
        hint: 'The snapshot may be incomplete. Try verifying or re-running snapshot.',
        next: `timeclaw verify ${snapshotId}`
      });
    }
    const dst = path.join(target, rel);
    await copyFileAtomic(objPath, dst);
  }

  // also copy manifest for traceability
  try {
    await fs.copyFile(manifestPath, path.join(target, 'manifest.json'));
  } catch {}

  console.log(JSON.stringify({ ok: true, snapshotId, target, files: entries.length }, null, 2));
}
