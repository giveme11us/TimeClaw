import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDir, safeReadJson, safeWriteJson, statSafe } from './fsops.js';
import { lockDir, machineRoot } from './layout.js';
import { UserError } from './errors.js';

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function withMachineLock({ dest, machineId, command, force = false, maxAgeMs = DEFAULT_MAX_AGE_MS }, fn) {
  const lock = await acquireMachineLock({ dest, machineId, command, force, maxAgeMs });
  let err = null;
  try {
    return await fn();
  } catch (e) {
    err = e;
  } finally {
    try {
      await releaseMachineLock(lock);
    } catch (releaseErr) {
      if (!err) throw releaseErr;
      console.error(`Warning: failed to release lock at ${lock?.dir || 'unknown'}: ${releaseErr?.message || releaseErr}`);
    }
  }
  throw err;
}

export async function acquireMachineLock({ dest, machineId, command, force = false, maxAgeMs = DEFAULT_MAX_AGE_MS }) {
  if (!dest || !machineId) {
    throw new Error('acquireMachineLock requires dest and machineId');
  }

  const dir = lockDir(dest, machineId);
  const lockPath = path.join(dir, 'lock.json');

  await ensureDir(machineRoot(dest, machineId));

  const attempt = async () => {
    await fs.mkdir(dir);
    const info = {
      pid: process.pid,
      hostname: os.hostname(),
      startedAt: new Date().toISOString(),
      command: command || null
    };
    await safeWriteJson(lockPath, info);
    return { dir, path: lockPath, info };
  };

  try {
    return await attempt();
  } catch (err) {
    if (err?.code !== 'EEXIST') throw err;
    if (force) {
      await fs.rm(dir, { recursive: true, force: true });
      return await attempt();
    }
    const existing = await readLockInfo(dir);
    const ageMs = existing?.startedAt ? Date.now() - Date.parse(existing.startedAt) : existing?.mtimeMs ? Date.now() - existing.mtimeMs : null;
    const stale = Number.isFinite(ageMs) && ageMs > maxAgeMs;
    const ageText = formatAge(ageMs);
    const detail = formatLockDetail(existing, dir, ageText, stale, maxAgeMs);
    throw new UserError('Another TimeClaw command is already running for this destination and machine.', {
      code: 'LOCKED',
      exitCode: 7,
      hint: detail,
      next: command ? `timeclaw ${command} --force-lock` : 'timeclaw <command> --force-lock'
    });
  }
}

export async function releaseMachineLock(lock) {
  if (!lock?.dir) return;
  await fs.rm(lock.dir, { recursive: true, force: true });
}

async function readLockInfo(dir) {
  const lockPath = path.join(dir, 'lock.json');
  let info = null;
  try {
    info = await safeReadJson(lockPath);
  } catch {
    info = null;
  }

  const stat = await statSafe(lockPath);
  const dirStat = stat ? null : await statSafe(dir);

  return {
    ...(info || {}),
    mtimeMs: stat?.mtimeMs ?? dirStat?.mtimeMs ?? null
  };
}

function formatLockDetail(info, dir, ageText, stale, maxAgeMs) {
  const parts = [];
  if (info?.command) parts.push(`command ${info.command}`);
  if (info?.pid) parts.push(`pid ${info.pid}`);
  if (info?.hostname) parts.push(`host ${info.hostname}`);
  if (info?.startedAt) parts.push(`started ${info.startedAt}`);
  if (ageText) parts.push(`age ${ageText}${stale ? ' (stale?)' : ''}`);
  const header = `Lock: ${dir}`;
  const meta = parts.length ? parts.join(', ') : 'no metadata available';
  const staleNote = stale ? ` Lock age exceeds ${formatAge(maxAgeMs)}.` : '';
  return `${header}. Owner: ${meta}.${staleNote} If you are sure no other TimeClaw command is running, re-run with --force-lock to break the lock.`;
}

function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
