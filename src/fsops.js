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

export async function listFilesRecursive(root, { includes = [], excludes = [] } = {}) {
  const out = [];
  const includeMatchers = includes.length > 0 ? compileGlobMatchers(includes, root) : compileGlobMatchers(['**']);
  const excludeMatchers = compileGlobMatchers(excludes, root);

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const rel = normalizeRel(path.relative(root, abs));
      if (rel === '' || rel === '.') continue;

      if (matchAnyGlob(rel, excludeMatchers)) {
        continue;
      }

      if (ent.isDirectory()) {
        await walk(abs);
      } else if (ent.isFile()) {
        if (matchAnyGlob(rel, includeMatchers)) out.push({ abs, rel });
      }
    }
  }

  await walk(root);
  return out;
}

export function normalizeRel(rel) {
  return rel.split(path.sep).join('/');
}

export function compileGlobMatchers(patterns, root = null) {
  if (!Array.isArray(patterns)) return [];
  const out = [];
  for (const raw of patterns) {
    if (typeof raw !== 'string') continue;
    const normalized = normalizeGlobPattern(raw, root);
    if (!normalized) continue;
    const expanded = expandGlobPattern(normalized);
    for (const p of expanded) {
      const regex = globToRegExp(p);
      out.push({ raw: p, regex });
    }
  }
  return out;
}

export function matchAnyGlob(rel, matchers) {
  if (!matchers || matchers.length === 0) return false;
  for (const m of matchers) {
    if (m.regex.test(rel)) return true;
  }
  return false;
}

function normalizeGlobPattern(pattern, root) {
  let out = String(pattern).trim();
  if (!out) return null;
  if (path.isAbsolute(out)) {
    const rel = path.relative(root || process.cwd(), out);
    if (rel.startsWith('..')) return null;
    out = rel;
  }
  out = normalizeRel(out);
  out = out.replace(/^\.\//, '');
  if (!out) return null;
  if (out.endsWith('/')) out = out + '**';
  return out;
}

function expandGlobPattern(pattern) {
  if (!pattern) return [];
  if (!hasGlobChars(pattern)) {
    return [pattern, pattern + '/**'];
  }
  return [pattern];
}

function hasGlobChars(pattern) {
  return /[*?\[]/.test(pattern);
}

function globToRegExp(pattern) {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // ** => match across path segments
        while (pattern[i + 1] === '*') i++;
        re += '.*';
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '[') {
      const cls = readCharClass(pattern, i);
      if (cls) {
        re += cls.src;
        i = cls.end;
      } else {
        re += '\\[';
      }
    } else if (ch === '\\') {
      if (i + 1 < pattern.length) {
        re += escapeRegex(pattern[i + 1]);
        i++;
      } else {
        re += '\\\\';
      }
    } else {
      re += escapeRegex(ch);
    }
    i++;
  }
  re += '$';
  return new RegExp(re);
}

function readCharClass(pattern, start) {
  let i = start + 1;
  if (i >= pattern.length) return null;
  let negate = false;
  if (pattern[i] === '!' || pattern[i] === '^') {
    negate = true;
    i++;
  }
  let src = '';
  for (; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === ']') {
      if (!src) return null;
      return { src: `[${negate ? '^' : ''}${src}]`, end: i };
    }
    if (ch === '\\' && i + 1 < pattern.length) {
      src += escapeRegex(pattern[i + 1]);
      i++;
      continue;
    }
    src += escapeClassChar(ch);
  }
  return null;
}

function escapeRegex(ch) {
  return /[.+^${}()|\\]/.test(ch) ? `\\${ch}` : ch;
}

function escapeClassChar(ch) {
  return /[\\\]^-]/.test(ch) ? `\\${ch}` : ch;
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
