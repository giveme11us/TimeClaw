import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ensureDir, listFilesRecursive, normalizeRel, copyFileAtomic, statSafe, sha256File, safeWriteJson, safeReadJson, pathExists } from './fsops.js';
import { markerPath, snapshotsDir, stagingDir, latestPointerPath, tcRoot, objectsDir } from './layout.js';

export function makeSnapshotId(date = new Date()) {
  // 2026-02-03T17-18-00Z
  return date.toISOString().replace(/:/g, '-');
}

export async function initDest({ dest }) {
  await ensureDir(tcRoot(dest));
  const mp = markerPath(dest);
  if (!(await pathExists(mp))) {
    await safeWriteJson(mp, { createdAt: new Date().toISOString(), schema: 1, tool: 'timeclaw' });
  }
}

export async function readLatest({ dest, machineId }) {
  const p = latestPointerPath(dest, machineId);
  if (!(await pathExists(p))) return null;
  const j = await safeReadJson(p);
  if (!j?.snapshotId) return null;
  return j.snapshotId;
}

export async function writeLatest({ dest, machineId, snapshotId }) {
  await safeWriteJson(latestPointerPath(dest, machineId), { snapshotId, updatedAt: new Date().toISOString() });
}

export async function createSnapshot({ dest, machineId, sourceRoot, includes, excludes, label, dryRun }) {
  await initDest({ dest });
  await ensureDir(snapshotsDir(dest, machineId));
  await ensureDir(stagingDir(dest, machineId));
  await ensureDir(objectsDir(dest, machineId));

  const snapshotId = makeSnapshotId();
  const stageBase = path.join(stagingDir(dest, machineId), snapshotId + '.tmp.' + crypto.randomBytes(4).toString('hex'));
  const finalBase = path.join(snapshotsDir(dest, machineId), snapshotId);

  if (dryRun) {
    return { snapshotId, dryRun: true };
  }

  // Previous snapshot id (informational)
  const prevId = await readLatest({ dest, machineId });

  await ensureDir(stageBase);

  const manifest = {
    id: snapshotId,
    createdAt: new Date().toISOString(),
    machineId,
    sourceRoot,
    label: label || null,
    prev: prevId || null,
    stats: { files: 0, reused: 0, stored: 0 },
    sha256: {},
    host: { hostname: os.hostname(), platform: os.platform(), release: os.release() }
  };

  const includeAbs = includes.map((p) => path.resolve(sourceRoot, p));

  for (let i = 0; i < includeAbs.length; i++) {
    const abs = includeAbs[i];
    const relBase = normalizeRel(path.relative(sourceRoot, abs));

    const st = await statSafe(abs);
    if (!st) continue;

    if (st.isFile()) {
      await snapshotOneFile({ abs, rel: relBase, dest, machineId, manifest });
    } else if (st.isDirectory()) {
      const files = await listFilesRecursive(abs, { excludes });
      for (const f of files) {
        const rel = normalizeRel(path.join(relBase, f.rel));
        await snapshotOneFile({ abs: f.abs, rel, dest, machineId, manifest });
      }
    }
  }

  await safeWriteJson(path.join(stageBase, 'manifest.json'), manifest);

  // Atomic publish
  await fs.rename(stageBase, finalBase);
  await writeLatest({ dest, machineId, snapshotId });

  return { snapshotId, manifest };
}

async function snapshotOneFile({ abs, rel, dest, machineId, manifest }) {
  // Cross-filesystem dedup strategy:
  // - Store file contents once in an object store keyed by sha256
  // - Snapshot manifest maps relPath -> sha256
  // - Restore materializes a snapshot by copying objects back to target
  const relNorm = normalizeRel(rel);

  // Hash the source file
  const hash = await sha256File(abs);
  manifest.sha256[relNorm] = hash;
  manifest.stats.files++;

  const objDir = path.join(objectsDir(dest, machineId), hash.slice(0, 2));
  const objPath = path.join(objDir, hash);

  if (await pathExists(objPath)) {
    manifest.stats.reused++;
    return;
  }

  await ensureDir(objDir);
  await copyFileAtomic(abs, objPath);
  manifest.stats.stored++;
}
