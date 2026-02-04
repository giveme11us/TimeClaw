import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureDir, listFilesRecursive, normalizeRel, copyFileAtomic, sha256File, pathExists, safeReadJson, safeWriteJson } from './fsops.js';
import { objectsDir } from './layout.js';

function isValidManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object') return false;
  if (!manifest.id || typeof manifest.id !== 'string') return false;
  if (!manifest.sha256 || typeof manifest.sha256 !== 'object') return false;
  return true;
}

export async function detectSnapshotLayout(snapshotDir) {
  const manifestPath = path.join(snapshotDir, 'manifest.json');
  if (await pathExists(manifestPath)) {
    try {
      const manifest = await safeReadJson(manifestPath);
      if (isValidManifestShape(manifest)) {
        return { layout: 'cas', manifestPath, manifest };
      }
      return { layout: 'legacy-tree', manifestPath, manifestInvalid: true };
    } catch {
      return { layout: 'legacy-tree', manifestPath, manifestInvalid: true };
    }
  }

  let hasEntries = false;
  try {
    const entries = await fs.readdir(snapshotDir, { withFileTypes: true });
    hasEntries = entries.some((ent) => ent.isFile() || ent.isDirectory());
  } catch {
    hasEntries = false;
  }

  if (!hasEntries) return { layout: 'empty', manifestPath };
  return { layout: 'legacy-tree', manifestPath };
}

export async function listLegacySnapshotFiles(snapshotDir) {
  const files = await listFilesRecursive(snapshotDir);
  return files.filter((f) => normalizeRel(f.rel) !== 'manifest.json');
}

export async function migrateLegacySnapshot({ snapshotDir, dest, machineId, snapshotId, label, dryRun }) {
  const files = await listLegacySnapshotFiles(snapshotDir);

  const manifest = {
    id: snapshotId,
    createdAt: new Date().toISOString(),
    machineId,
    sourceRoot: null,
    label: label || null,
    prev: null,
    stats: { files: 0, reused: 0, stored: 0 },
    sha256: {},
    legacy: { layout: 'tree', migratedAt: new Date().toISOString() },
    host: { hostname: os.hostname(), platform: os.platform(), release: os.release() }
  };

  if (dryRun) {
    return { manifest, files: files.length, dryRun: true };
  }

  await ensureDir(objectsDir(dest, machineId));

  for (const f of files) {
    const relNorm = normalizeRel(f.rel);
    const hash = await sha256File(f.abs);
    manifest.sha256[relNorm] = hash;
    manifest.stats.files++;

    const objDir = path.join(objectsDir(dest, machineId), hash.slice(0, 2));
    const objPath = path.join(objDir, hash);

    if (await pathExists(objPath)) {
      manifest.stats.reused++;
      continue;
    }

    await ensureDir(objDir);
    await copyFileAtomic(f.abs, objPath);
    manifest.stats.stored++;
  }

  await safeWriteJson(path.join(snapshotDir, 'manifest.json'), manifest);
  return { manifest, files: files.length, dryRun: false };
}
