import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { cmdInit } from '../src/commands/init.js';
import { cmdSnapshot } from '../src/commands/snapshot.js';
import { cmdVerify } from '../src/commands/verify.js';
import { cmdExport } from '../src/commands/export.js';
import { cmdImport } from '../src/commands/import.js';

async function mkTempDir(prefix) {
  const d = path.join(os.tmpdir(), prefix + '-' + crypto.randomBytes(4).toString('hex'));
  await fs.mkdir(d, { recursive: true });
  return d;
}

async function writeJson(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj, null, 2));
}

async function readJson(p) {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const destA = await mkTempDir('timeclaw-dest-a');
  const source = await mkTempDir('timeclaw-src-pack');

  await fs.mkdir(path.join(source, 'workspace', 'skills', 'skill-a'), { recursive: true });
  await fs.mkdir(path.join(source, 'memory'), { recursive: true });

  await fs.writeFile(path.join(source, 'openclaw.json'), '{"hello":true}\n');
  await fs.writeFile(path.join(source, 'MEMORY.md'), '# hi\n');
  await fs.writeFile(path.join(source, 'memory', '2026-01-01.md'), 'x\n');
  await fs.writeFile(path.join(source, 'workspace', 'skills', 'skill-a', 'index.js'), 'console.log("ok")\n');

  const cfgAPath = path.join(source, 'timeclaw.config.json');
  await writeJson(cfgAPath, {
    dest: destA,
    machineId: 'pack-src',
    sourceRoot: source,
    preset: 'openclaw'
  });

  const cwdBefore = process.cwd();
  process.chdir(source);

  await cmdInit({ flags: { dest: destA, machine: 'pack-src', config: cfgAPath } });
  await cmdSnapshot({ flags: { config: cfgAPath } });

  const snapsDirA = path.join(destA, 'TimeClaw', 'machines', 'pack-src', 'snapshots');
  const entries = (await fs.readdir(snapsDirA)).sort();
  const snapshotId = entries[entries.length - 1];

  const packPath = path.join(await mkTempDir('timeclaw-pack'), `pack-${snapshotId}.tgz`);
  await cmdExport({ snapshotId, flags: { config: cfgAPath, out: packPath } });

  const destB = await mkTempDir('timeclaw-dest-b');
  const cfgBPath = path.join(destB, 'timeclaw.config.json');
  await writeJson(cfgBPath, {
    dest: destB,
    machineId: 'pack-dest',
    sourceRoot: source,
    preset: 'openclaw'
  });

  await cmdInit({ flags: { dest: destB, machine: 'pack-dest', config: cfgBPath } });
  await cmdImport({ packPath, flags: { config: cfgBPath } });

  const snapsDirB = path.join(destB, 'TimeClaw', 'machines', 'pack-dest', 'snapshots');
  const manifestPath = path.join(snapsDirB, snapshotId, 'manifest.json');
  const manifest = await readJson(manifestPath);
  if (manifest.id !== snapshotId) {
    throw new Error('imported manifest id mismatch');
  }

  await cmdVerify({ snapshotId, flags: { config: cfgBPath } });

  process.chdir(cwdBefore);
  console.log('PACK_OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
