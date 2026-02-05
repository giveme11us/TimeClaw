import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform, Writable } from 'node:stream';
import { createGzip, createGunzip } from 'node:zlib';
import tar from 'tar-stream';
import { ensureDir, pathExists, safeReadJson } from './fsops.js';
import { snapshotsDir, objectsDir } from './layout.js';
import { UserError } from './errors.js';

const PACK_SCHEMA = 1;
const MAX_META_BYTES = 50 * 1024 * 1024;

export async function exportSnapshotPack({ dest, machineId, snapshotId, outPath }) {
  const snapDir = path.join(snapshotsDir(dest, machineId), snapshotId);
  const manifestPath = path.join(snapDir, 'manifest.json');

  if (!(await pathExists(manifestPath))) {
    throw new UserError(`Snapshot manifest not found: ${snapshotId}`, {
      code: 'SNAPSHOT_MISSING',
      exitCode: 4,
      hint: 'Legacy snapshots cannot be exported. Use verify --migrate first.',
      next: `timeclaw verify ${snapshotId} --migrate`
    });
  }

  const manifest = await safeReadJson(manifestPath);
  const hashes = collectManifestHashes(manifest);

  const packMeta = {
    schema: PACK_SCHEMA,
    tool: 'timeclaw',
    snapshotId: manifest?.id || snapshotId,
    machineId: manifest?.machineId || machineId,
    createdAt: manifest?.createdAt || new Date().toISOString(),
    packedAt: new Date().toISOString()
  };

  const outAbs = path.resolve(outPath || `timeclaw-pack-${snapshotId}.tgz`);
  await ensureDir(path.dirname(outAbs));

  const pack = tar.pack();
  const gzip = createGzip();
  const out = fssync.createWriteStream(outAbs);
  const done = pipeline(pack, gzip, out);

  await addBufferEntry(pack, 'pack.json', Buffer.from(JSON.stringify(packMeta, null, 2) + '\n', 'utf8'));
  await addBufferEntry(pack, 'manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'));

  for (const hash of hashes) {
    const objPath = path.join(objectsDir(dest, machineId), hash.slice(0, 2), hash);
    if (!(await pathExists(objPath))) {
      throw new UserError(`Missing object for ${hash}`, {
        code: 'OBJECT_MISSING',
        exitCode: 4,
        hint: 'The snapshot may be incomplete. Try verify or re-snapshot.',
        next: `timeclaw verify ${snapshotId}`
      });
    }
    const entryName = `objects/${hash.slice(0, 2)}/${hash}`;
    await addFileEntry(pack, entryName, objPath);
  }

  pack.finalize();
  await done;

  return { ok: true, snapshotId, out: outAbs, objects: hashes.size };
}

export async function importSnapshotPack({ dest, machineId, packPath, force = false }) {
  const packAbs = path.resolve(packPath);
  if (!(await pathExists(packAbs))) {
    throw new UserError(`Pack not found: ${packAbs}`, {
      code: 'PACK_MISSING',
      exitCode: 3,
      hint: 'Provide the path to a pack file created by timeclaw export.'
    });
  }

  await ensureDir(objectsDir(dest, machineId));
  await ensureDir(snapshotsDir(dest, machineId));

  const extract = tar.extract();
  const gunzip = createGunzip();
  const src = fssync.createReadStream(packAbs);
  const done = pipeline(src, gunzip, extract);

  let packJson = null;
  let manifest = null;
  const seenHashes = new Set();

  extract.on('entry', (header, stream, next) => {
    handleEntry({ header, stream, dest, machineId, seenHashes })
      .then((result) => {
        if (result?.packJson) {
          if (packJson) throw new UserError('Duplicate pack.json in pack', { code: 'PACK_INVALID', exitCode: 3 });
          packJson = result.packJson;
        }
        if (result?.manifest) {
          if (manifest) throw new UserError('Duplicate manifest.json in pack', { code: 'PACK_INVALID', exitCode: 3 });
          manifest = result.manifest;
        }
        next();
      })
      .catch((err) => extract.destroy(err));
  });

  await done;

  if (!packJson) {
    throw new UserError('Pack missing pack.json', {
      code: 'PACK_INVALID',
      exitCode: 3,
      hint: 'Ensure the pack was created by timeclaw export.'
    });
  }
  if (!manifest) {
    throw new UserError('Pack missing manifest.json', {
      code: 'PACK_INVALID',
      exitCode: 3,
      hint: 'Ensure the pack includes a snapshot manifest.'
    });
  }

  validatePackJson(packJson);

  const snapshotId = packJson.snapshotId || manifest?.id;
  if (!snapshotId) {
    throw new UserError('Pack missing snapshot id', {
      code: 'PACK_INVALID',
      exitCode: 3,
      hint: 'Pack metadata is incomplete.'
    });
  }

  if (manifest?.id && packJson.snapshotId && manifest.id !== packJson.snapshotId) {
    throw new UserError('Pack snapshot id does not match manifest id', {
      code: 'PACK_INVALID',
      exitCode: 3,
      hint: 'Re-export the pack to ensure it is consistent.'
    });
  }

  const requiredHashes = collectManifestHashes(manifest);
  for (const hash of requiredHashes) {
    const objPath = path.join(objectsDir(dest, machineId), hash.slice(0, 2), hash);
    if (!(await pathExists(objPath))) {
      throw new UserError(`Pack missing object for ${hash}`, {
        code: 'PACK_INCOMPLETE',
        exitCode: 3,
        hint: 'Re-export the pack; it should include all referenced objects.'
      });
    }
  }

  const snapDir = path.join(snapshotsDir(dest, machineId), snapshotId);
  const manifestPath = path.join(snapDir, 'manifest.json');
  if ((await pathExists(manifestPath)) && !force) {
    throw new UserError(`Snapshot already exists: ${snapshotId}`, {
      code: 'SNAPSHOT_EXISTS',
      exitCode: 3,
      hint: 'Use --force to overwrite the existing manifest.'
    });
  }

  await ensureDir(snapDir);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  return { ok: true, snapshotId, imported: requiredHashes.size, objects: seenHashes.size };
}

function collectManifestHashes(manifest) {
  const hashes = new Set();
  const files = manifest?.files;
  if (files && typeof files === 'object') {
    for (const meta of Object.values(files)) {
      const hash = meta?.sha256;
      if (typeof hash === 'string') hashes.add(hash);
    }
  }
  const shaMap = manifest?.sha256;
  if (shaMap && typeof shaMap === 'object') {
    for (const hash of Object.values(shaMap)) {
      if (typeof hash === 'string') hashes.add(hash);
    }
  }
  return hashes;
}

function normalizeTarPath(name) {
  if (!name) return null;
  const raw = String(name);
  if (!raw || raw.includes('\0') || raw.includes('\\')) return null;
  const normalized = path.posix.normalize(raw).replace(/^\.\//, '');
  if (!normalized || normalized === '.') return null;
  if (path.posix.isAbsolute(normalized)) return null;
  if (normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

async function handleEntry({ header, stream, dest, machineId, seenHashes }) {
  const name = normalizeTarPath(header?.name);
  if (!name) {
    await drainStream(stream);
    throw new UserError(`Invalid pack entry path: ${header?.name || ''}`, {
      code: 'PACK_INVALID',
      exitCode: 3,
      hint: 'Pack entry paths must be relative and free of traversal.'
    });
  }

  if (header.type === 'directory' || header.type === 'dir') {
    await drainStream(stream);
    return null;
  }

  if (name === 'pack.json') {
    if (stream.readableLength > MAX_META_BYTES) {
      await drainStream(stream);
      throw new UserError('pack.json is too large', { code: 'PACK_INVALID', exitCode: 3 });
    }
    const buf = await streamToBuffer(stream, MAX_META_BYTES);
    return { packJson: safeParseJson(buf, 'pack.json') };
  }

  if (name === 'manifest.json') {
    if (stream.readableLength > MAX_META_BYTES) {
      await drainStream(stream);
      throw new UserError('manifest.json is too large', { code: 'PACK_INVALID', exitCode: 3 });
    }
    const buf = await streamToBuffer(stream, MAX_META_BYTES);
    return { manifest: safeParseJson(buf, 'manifest.json') };
  }

  if (name.startsWith('objects/')) {
    const parts = name.split('/');
    if (parts.length !== 3) {
      await drainStream(stream);
      throw new UserError(`Invalid object entry: ${name}`, { code: 'PACK_INVALID', exitCode: 3 });
    }
    const prefix = parts[1];
    const hash = parts[2];
    if (!/^[0-9a-f]{2}$/.test(prefix) || !/^[0-9a-f]{64}$/.test(hash)) {
      await drainStream(stream);
      throw new UserError(`Invalid object hash path: ${name}`, { code: 'PACK_INVALID', exitCode: 3 });
    }
    if (hash.slice(0, 2) !== prefix) {
      await drainStream(stream);
      throw new UserError(`Object prefix mismatch: ${name}`, { code: 'PACK_INVALID', exitCode: 3 });
    }

    const objDir = path.join(objectsDir(dest, machineId), prefix);
    const objPath = path.join(objDir, hash);
    const exists = await pathExists(objPath);

    await ensureDir(objDir);

    const tempPath = exists ? null : objPath + '.tmp.' + crypto.randomBytes(4).toString('hex');
    const hashObj = crypto.createHash('sha256');
    const sink = tempPath ? fssync.createWriteStream(tempPath) : createDevNull();
    const hashTransform = createHashTransform(hashObj);

    await pipeline(stream, hashTransform, sink);
    const digest = hashObj.digest('hex');

    if (digest !== hash) {
      if (tempPath) await safeUnlink(tempPath);
      throw new UserError(`Object hash mismatch: ${hash}`, {
        code: 'PACK_INVALID',
        exitCode: 3,
        hint: 'The pack may be corrupted.'
      });
    }

    if (!exists && tempPath) {
      await fs.rename(tempPath, objPath);
    } else if (tempPath) {
      await safeUnlink(tempPath);
    }

    seenHashes.add(hash);
    return null;
  }

  await drainStream(stream);
  throw new UserError(`Unexpected pack entry: ${name}`, {
    code: 'PACK_INVALID',
    exitCode: 3,
    hint: 'Pack should only include pack.json, manifest.json, and objects.'
  });
}

function safeParseJson(buf, label) {
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new UserError(`Invalid JSON in ${label}`, {
      code: 'PACK_INVALID',
      exitCode: 3,
      hint: 'Pack metadata is corrupt.'
    });
  }
}

function validatePackJson(packJson) {
  if (!packJson || typeof packJson !== 'object') {
    throw new UserError('Invalid pack.json', { code: 'PACK_INVALID', exitCode: 3 });
  }
  if (packJson.schema !== PACK_SCHEMA) {
    throw new UserError('Unsupported pack schema', {
      code: 'PACK_UNSUPPORTED',
      exitCode: 3,
      hint: `Expected schema ${PACK_SCHEMA}.`
    });
  }
  if (!packJson.snapshotId || !packJson.machineId || !packJson.createdAt) {
    throw new UserError('pack.json missing required fields', {
      code: 'PACK_INVALID',
      exitCode: 3,
      hint: 'Expected snapshotId, machineId, createdAt.'
    });
  }
}

async function addBufferEntry(pack, name, buf) {
  await new Promise((resolve, reject) => {
    const entry = pack.entry({ name, size: buf.length, mode: 0o644 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
    entry.end(buf);
  });
}

async function addFileEntry(pack, name, filePath) {
  const st = await fs.stat(filePath);
  await new Promise((resolve, reject) => {
    const entry = pack.entry({ name, size: st.size, mode: 0o644, mtime: new Date(st.mtimeMs) }, (err) => {
      if (err) reject(err);
      else resolve();
    });
    const rs = fssync.createReadStream(filePath);
    rs.on('error', reject);
    rs.pipe(entry);
  });
}

function createHashTransform(hash) {
  return new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    }
  });
}

function createDevNull() {
  return new Writable({
    write(_chunk, _enc, cb) {
      cb();
    }
  });
}

async function streamToBuffer(stream, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (limit && total > limit) {
      throw new UserError('Pack metadata entry too large', { code: 'PACK_INVALID', exitCode: 3 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function drainStream(stream) {
  for await (const _ of stream) {
    // drain
  }
}

async function safeUnlink(p) {
  try {
    await fs.unlink(p);
  } catch {
    // ignore
  }
}
