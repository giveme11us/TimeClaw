import path from 'node:path';
import fs from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { snapshotsDir, objectsDir } from '../layout.js';
import { ensureDir, copyFileAtomic, pathExists, safeReadJson } from '../fsops.js';
import { detectSnapshotLayout, listLegacySnapshotFiles, migrateLegacySnapshot } from '../legacy.js';

export async function cmdRestore({ snapshotId, flags }) {
  const { config } = await loadConfig({ configPath: flags.config });
  const dryRun = !!flags['dry-run'] || !!flags.dryRun;
  const migrate = !!flags.migrate || !!flags['migrate-legacy'] || !!flags.migrateLegacy;
  const target = flags.target ? path.resolve(flags.target) : path.resolve(process.cwd(), `timeclaw-restore-${snapshotId}`);

  const snapBase = path.join(snapshotsDir(config.dest, config.machineId), snapshotId);
  if (!(await pathExists(snapBase))) throw new Error(`snapshot not found: ${snapBase}`);

  const layout = await detectSnapshotLayout(snapBase);

  if (layout.layout !== 'cas') {
    if (layout.layout === 'legacy-tree') {
      if (layout.manifestInvalid) {
        console.warn(`Warning: manifest.json is missing or invalid for ${snapshotId}; treating snapshot as legacy tree.`);
      } else {
        console.warn(`Warning: legacy snapshot layout detected for ${snapshotId}; restoring from snapshot tree.`);
      }

      if (migrate) {
        if (dryRun) {
          const files = await listLegacySnapshotFiles(snapBase);
          console.log(JSON.stringify({ dryRun: true, snapshotId, target, legacy: true, wouldMigrate: true, files: files.length }, null, 2));
          return;
        }

        await migrateLegacySnapshot({ snapshotDir: snapBase, dest: config.dest, machineId: config.machineId, snapshotId });
      } else {
        if (dryRun) {
          const files = await listLegacySnapshotFiles(snapBase);
          console.log(JSON.stringify({ dryRun: true, snapshotId, target, legacy: true, files: files.length }, null, 2));
          return;
        }

        await ensureDir(target);
        const files = await listLegacySnapshotFiles(snapBase);
        for (const f of files) {
          const dst = path.join(target, f.rel);
          await copyFileAtomic(f.abs, dst);
        }
        console.log(JSON.stringify({ ok: true, snapshotId, target, files: files.length, legacy: true }, null, 2));
        return;
      }
    } else {
      throw new Error(`snapshot has no manifest and no files: ${snapBase}`);
    }
  }

  const manifest = layout.manifest || (await safeReadJson(layout.manifestPath));
  const entries = Object.entries(manifest.sha256 || {});

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, snapshotId, target, files: entries.length }, null, 2));
    return;
  }

  await ensureDir(target);

  for (const [rel, hash] of entries) {
    const objPath = path.join(objectsDir(config.dest, config.machineId), String(hash).slice(0, 2), String(hash));
    if (!(await pathExists(objPath))) throw new Error(`missing object for ${rel}: ${objPath}`);
    const dst = path.join(target, rel);
    await copyFileAtomic(objPath, dst);
  }

  // also copy manifest for traceability
  try {
    await fs.copyFile(layout.manifestPath, path.join(target, 'manifest.json'));
  } catch {}

  console.log(JSON.stringify({ ok: true, snapshotId, target, files: entries.length }, null, 2));
}
