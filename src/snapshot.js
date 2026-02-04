import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ensureDir, listFilesRecursive, normalizeRel, copyFileAtomic, statSafe, sha256File, safeWriteJson, safeReadJson, pathExists } from './fsops.js';
import { markerPath, snapshotsDir, stagingDir, latestPointerPath, tcRoot, objectsDir } from './layout.js';

const HASH_CONCURRENCY = Math.max(1, Math.min(8, os.cpus().length || 1));

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
  const prevIndex = await loadPrevIndex({ dest, machineId, prevId });

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
    files: {},
    host: { hostname: os.hostname(), platform: os.platform(), release: os.release() }
  };

  const files = await listFilesRecursive(sourceRoot, { includes, excludes });

  await runWithLimit(files, HASH_CONCURRENCY, (entry) =>
    snapshotOneFile({ abs: entry.abs, rel: entry.rel, dest, machineId, manifest, prevIndex })
  );

  await safeWriteJson(path.join(stageBase, 'manifest.json'), manifest);

  // Atomic publish
  await fs.rename(stageBase, finalBase);
  await writeLatest({ dest, machineId, snapshotId });

  return { snapshotId, manifest };
}

async function snapshotOneFile({ abs, rel, dest, machineId, manifest, prevIndex }) {
  // Cross-filesystem dedup strategy:
  // - Store file contents once in an object store keyed by sha256
  // - Snapshot manifest maps relPath -> sha256
  // - Restore materializes a snapshot by copying objects back to target
  const relNorm = normalizeRel(rel);

  const st = await statSafe(abs);
  if (!st || !st.isFile()) return;

  const size = st.size;
  const mtimeMs = Math.trunc(st.mtimeMs);

  const prev = prevIndex ? prevIndex.get(relNorm) : null;
  let hash = null;
  if (prev && prev.size === size && prev.mtimeMs === mtimeMs && prev.sha256) {
    hash = prev.sha256;
  } else {
    hash = await sha256File(abs);
  }

  manifest.sha256[relNorm] = hash;
  manifest.files[relNorm] = { sha256: hash, size, mtimeMs };
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

async function loadPrevIndex({ dest, machineId, prevId }) {
  if (!prevId) return null;
  const manifestPath = path.join(snapshotsDir(dest, machineId), prevId, 'manifest.json');
  if (!(await pathExists(manifestPath))) return null;
  let manifest = null;
  try {
    manifest = await safeReadJson(manifestPath);
  } catch {
    return null;
  }
  const files = manifest?.files;
  if (!files || typeof files !== 'object') return null;
  const index = new Map();
  for (const [rel, meta] of Object.entries(files)) {
    if (!meta || typeof meta !== 'object') continue;
    const sha256 = meta.sha256;
    const size = Number(meta.size);
    const mtimeMs = Math.trunc(Number(meta.mtimeMs));
    if (!sha256 || !Number.isFinite(size) || !Number.isFinite(mtimeMs)) continue;
    index.set(normalizeRel(rel), { sha256, size, mtimeMs });
  }
  return index.size ? index : null;
}

async function runWithLimit(items, limit, fn) {
  if (!items.length) return;
  const actual = Math.max(1, Math.min(limit, items.length));
  let index = 0;
  const workers = Array.from({ length: actual }, async () => {
    while (true) {
      const i = index++;
      if (i >= items.length) break;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}
