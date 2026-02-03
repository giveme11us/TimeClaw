import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { snapshotsDir, objectsDir } from '../layout.js';
import { pathExists, safeReadJson } from '../fsops.js';

export async function cmdGc({ flags }) {
  const { config } = await loadConfig({ configPath: flags.config });
  const dryRun = !!flags['dry-run'] || !!flags.dryRun;

  const snapsBase = snapshotsDir(config.dest, config.machineId);
  const objsBase = objectsDir(config.dest, config.machineId);

  if (!(await pathExists(objsBase))) {
    console.log(JSON.stringify({ ok: true, dryRun, removed: 0, kept: 0, bytesRemoved: 0, bytesKept: 0 }, null, 2));
    return;
  }

  // Collect referenced hashes from all snapshot manifests.
  const referenced = new Set();
  if (await pathExists(snapsBase)) {
    const entries = await fs.readdir(snapsBase, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const manifestPath = path.join(snapsBase, ent.name, 'manifest.json');
      if (!(await pathExists(manifestPath))) continue;
      try {
        const manifest = await safeReadJson(manifestPath);
        for (const h of Object.values(manifest.sha256 || {})) {
          if (typeof h === 'string' && h.length >= 16) referenced.add(h);
        }
      } catch {
        // ignore malformed manifests
      }
    }
  }

  // Walk objects store and remove unreferenced.
  let removed = 0;
  let kept = 0;
  let bytesRemoved = 0;
  let bytesKept = 0;

  const bucketEntries = await fs.readdir(objsBase, { withFileTypes: true });
  for (const bucket of bucketEntries) {
    if (!bucket.isDirectory()) continue;
    const bucketPath = path.join(objsBase, bucket.name);
    const objEntries = await fs.readdir(bucketPath, { withFileTypes: true });

    for (const obj of objEntries) {
      if (!obj.isFile()) continue;
      const hash = obj.name;
      const objPath = path.join(bucketPath, hash);
      let size = 0;
      try {
        const st = await fs.stat(objPath);
        size = st.size || 0;
      } catch {}

      if (referenced.has(hash)) {
        kept++;
        bytesKept += size;
        continue;
      }

      removed++;
      bytesRemoved += size;
      if (!dryRun) {
        // Safety: only remove inside objectsDir
        await fs.rm(objPath, { force: true });
      }
    }

    // Optional: remove empty bucket dirs
    if (!dryRun) {
      try {
        const remaining = await fs.readdir(bucketPath);
        if (remaining.length === 0) await fs.rmdir(bucketPath);
      } catch {}
    }
  }

  console.log(
    JSON.stringify(
      { ok: true, dryRun, referenced: referenced.size, removed, kept, bytesRemoved, bytesKept },
      null,
      2
    )
  );
}
