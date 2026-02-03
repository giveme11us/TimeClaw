import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ensureDir, listFilesRecursive, normalizeRel, copyFileAtomic, tryHardlink, statSafe, sha256File, safeWriteJson, safeReadJson, pathExists } from './fsops.js';
import { markerPath, snapshotsDir, stagingDir, latestPointerPath, tcRoot } from './layout.js';

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

  const snapshotId = makeSnapshotId();
  const stageBase = path.join(stagingDir(dest, machineId), snapshotId + '.tmp.' + crypto.randomBytes(4).toString('hex'));
  const finalBase = path.join(snapshotsDir(dest, machineId), snapshotId);

  if (dryRun) {
    return { snapshotId, dryRun: true };
  }

  // Determine previous snapshot for hardlinking
  const prevId = await readLatest({ dest, machineId });
  const prevBase = prevId ? path.join(snapshotsDir(dest, machineId), prevId) : null;

  await ensureDir(stageBase);

  const manifest = {
    id: snapshotId,
    createdAt: new Date().toISOString(),
    machineId,
    sourceRoot,
    label: label || null,
    prev: prevId || null,
    stats: { files: 0, linked: 0, copied: 0 },
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
      await snapshotOneFile({ abs, rel: relBase, stageBase, prevBase, manifest });
    } else if (st.isDirectory()) {
      const files = await listFilesRecursive(abs, { excludes });
      for (const f of files) {
        const rel = normalizeRel(path.join(relBase, f.rel));
        await snapshotOneFile({ abs: f.abs, rel, stageBase, prevBase, manifest });
      }
    }
  }

  await safeWriteJson(path.join(stageBase, 'manifest.json'), manifest);

  // Atomic publish
  await fs.rename(stageBase, finalBase);
  await writeLatest({ dest, machineId, snapshotId });

  return { snapshotId, manifest };
}

async function snapshotOneFile({ abs, rel, stageBase, prevBase, manifest }) {
  const dst = path.join(stageBase, rel);

  let linked = false;
  if (prevBase) {
    const prevPath = path.join(prevBase, rel);
    const prevStat = await statSafe(prevPath);
    const curStat = await statSafe(abs);

    // cheap unchanged heuristic: size + mtime
    if (prevStat && curStat && prevStat.size === curStat.size && Math.floor(prevStat.mtimeMs) === Math.floor(curStat.mtimeMs)) {
      linked = await tryHardlink(prevPath, dst);
    }
  }

  if (linked) {
    manifest.stats.files++;
    manifest.stats.linked++;
    return;
  }

  await copyFileAtomic(abs, dst);
  manifest.stats.files++;
  manifest.stats.copied++;

  // store hash for verification (only for copied files to keep cost down)
  try {
    manifest.sha256[normalizeRel(rel)] = await sha256File(dst);
  } catch {
    // ignore hash errors
  }
}
