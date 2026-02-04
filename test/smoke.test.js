import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { cmdInit } from '../src/commands/init.js';
import { cmdSnapshot } from '../src/commands/snapshot.js';
import { cmdList } from '../src/commands/list.js';
import { cmdVerify } from '../src/commands/verify.js';

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
  const dest = await mkTempDir('timeclaw-dest');
  const source = await mkTempDir('timeclaw-src');

  // fake openclaw structure
  await fs.mkdir(path.join(source, 'workspace', 'skills', 'skill-a'), { recursive: true });
  await fs.mkdir(path.join(source, 'workspace', 'tmp'), { recursive: true });
  await fs.mkdir(path.join(source, 'memory'), { recursive: true });
  await fs.mkdir(path.join(source, 'media'), { recursive: true });

  await fs.writeFile(path.join(source, 'openclaw.json'), '{"hello":true}\n');
  await fs.writeFile(path.join(source, 'MEMORY.md'), '# hi\n');
  await fs.writeFile(path.join(source, 'memory', '2026-01-01.md'), 'x\n');

  // should be included by preset openclaw
  await fs.writeFile(path.join(source, 'workspace', 'skills', 'skill-a', 'index.js'), 'console.log("ok")\n');

  // should be excluded by preset openclaw
  await fs.writeFile(path.join(source, 'workspace', 'tmp', 'cache.txt'), 'nope\n');
  await fs.writeFile(path.join(source, 'memory', 'draft.tmp'), 'nope\n');

  const cfgPath = path.join(source, 'timeclaw.config.json');
  await writeJson(cfgPath, {
    dest,
    machineId: 'test-machine',
    sourceRoot: source,
    preset: 'openclaw',
    excludes: ['**/*.tmp']
  });

  const cwdBefore = process.cwd();
  process.chdir(source);

  await cmdInit({ flags: { dest, machine: 'test-machine', config: cfgPath } });
  await cmdSnapshot({ flags: { config: cfgPath } });
  await cmdList({ flags: { config: cfgPath } });

  // pick latest snapshot id by reading dest directory
  const snapsDir = path.join(dest, 'TimeClaw', 'machines', 'test-machine', 'snapshots');
  const entries = (await fs.readdir(snapsDir)).sort();
  const first = entries[entries.length - 1];
  await cmdVerify({ snapshotId: first, flags: { config: cfgPath } });

  const manifest1 = await readJson(path.join(snapsDir, first, 'manifest.json'));
  const keys1 = Object.keys(manifest1.sha256 || {}).sort();
  if (!keys1.includes('workspace/skills/skill-a/index.js')) throw new Error('missing included skill file');
  if (keys1.includes('workspace/tmp/cache.txt')) throw new Error('excluded tmp file included');
  if (keys1.includes('memory/draft.tmp')) throw new Error('excluded glob file included');

  await cmdSnapshot({ flags: { config: cfgPath } });

  const entriesAfter = (await fs.readdir(snapsDir)).sort();
  const last = entriesAfter[entriesAfter.length - 1];
  await cmdVerify({ snapshotId: last, flags: { config: cfgPath } });

  const manifest2 = await readJson(path.join(snapsDir, last, 'manifest.json'));

  if (!manifest1.files || !manifest2.files) {
    throw new Error('manifest missing files metadata');
  }
  const fileKey = 'openclaw.json';
  const f1 = manifest1.files[fileKey];
  const f2 = manifest2.files[fileKey];
  if (!f1 || !f2) {
    throw new Error('expected file metadata missing');
  }
  if (f1.sha256 !== f2.sha256 || f1.size !== f2.size || f1.mtimeMs !== f2.mtimeMs) {
    throw new Error('file metadata did not carry forward for unchanged file');
  }
  if (manifest2.prev !== manifest1.id) {
    throw new Error('second snapshot does not reference previous snapshot');
  }

  process.chdir(cwdBefore);
  console.log('SMOKE_OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
