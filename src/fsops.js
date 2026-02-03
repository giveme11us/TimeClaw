import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

export async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function safeReadJson(p) {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

export async function safeWriteJson(p, obj) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export async function listFilesRecursive(root, { excludes = [] } = {}) {
  const out = [];
  const ex = excludes.map((e) => normalizeRel(e));

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const rel = normalizeRel(path.relative(root, abs));
      if (rel === '' || rel === '.') continue;

      if (ex.some((x) => rel === x || rel.startsWith(x + '/'))) {
        continue;
      }

      if (ent.isDirectory()) {
        await walk(abs);
      } else if (ent.isFile()) {
        out.push({ abs, rel });
      }
    }
  }

  await walk(root);
  return out;
}

export function normalizeRel(rel) {
  return rel.split(path.sep).join('/');
}

export async function copyFileAtomic(src, dst) {
  await ensureDir(path.dirname(dst));
  const tmp = dst + '.tmp.' + crypto.randomBytes(4).toString('hex');
  await fs.copyFile(src, tmp);
  await fs.rename(tmp, dst);
}

export async function tryHardlink(srcExisting, dst) {
  await ensureDir(path.dirname(dst));
  try {
    await fs.link(srcExisting, dst);
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(p) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const s = fssync.createReadStream(p);
    s.on('error', reject);
    s.on('data', (d) => hash.update(d));
    s.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function statSafe(p) {
  try { return await fs.stat(p); } catch { return null; }
}
