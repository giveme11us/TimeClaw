import path from 'node:path';
import fs from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { snapshotsDir } from '../layout.js';
import { ensureDir, listFilesRecursive, copyFileAtomic, pathExists } from '../fsops.js';

export async function cmdRestore({ snapshotId, flags }) {
  const { config } = await loadConfig({ configPath: flags.config });
  const dryRun = !!flags['dry-run'] || !!flags.dryRun;
  const target = flags.target ? path.resolve(flags.target) : path.resolve(process.cwd(), `timeclaw-restore-${snapshotId}`);

  const snapBase = path.join(snapshotsDir(config.dest, config.machineId), snapshotId);
  if (!(await pathExists(snapBase))) throw new Error(`snapshot not found: ${snapBase}`);

  // Copy everything except manifest.json into target.
  const files = await listFilesRecursive(snapBase, { excludes: ['manifest.json'] });

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, snapshotId, target, files: files.length }, null, 2));
    return;
  }

  await ensureDir(target);

  for (const f of files) {
    // f.rel is relative to snapBase
    if (f.rel === 'manifest.json') continue;
    const dst = path.join(target, f.rel);
    await copyFileAtomic(f.abs, dst);
  }

  // also copy manifest for traceability
  try {
    await fs.copyFile(path.join(snapBase, 'manifest.json'), path.join(target, 'manifest.json'));
  } catch {}

  console.log(JSON.stringify({ ok: true, snapshotId, target, files: files.length }, null, 2));
}
