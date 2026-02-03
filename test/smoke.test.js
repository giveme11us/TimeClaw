import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
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

async function main() {
  const dest = await mkTempDir('timeclaw-dest');
  const source = await mkTempDir('timeclaw-src');

  // fake openclaw structure
  await fs.mkdir(path.join(source, 'workspace', 'skills'), { recursive: true });
  await fs.mkdir(path.join(source, 'memory'), { recursive: true });
  await fs.writeFile(path.join(source, 'openclaw.json'), '{"hello":true}\n');
  await fs.writeFile(path.join(source, 'MEMORY.md'), '# hi\n');
  await fs.writeFile(path.join(source, 'memory', '2026-01-01.md'), 'x\n');

  const cfgPath = path.join(source, 'timeclaw.config.json');
  await writeJson(cfgPath, {
    dest,
    machineId: 'test-machine',
    sourceRoot: source,
    includes: ['openclaw.json', 'MEMORY.md', 'memory'],
    excludes: ['media', 'tmp', 'workspace/tmp']
  });

  const cwdBefore = process.cwd();
  process.chdir(source);

  await cmdInit({ flags: { dest, machine: 'test-machine', config: cfgPath } });
  await cmdSnapshot({ flags: { config: cfgPath } });
  await cmdList({ flags: { config: cfgPath } });

  // pick latest snapshot id by reading dest directory
  const snapsDir = path.join(dest, 'TimeClaw', 'machines', 'test-machine', 'snapshots');
  const entries = (await fs.readdir(snapsDir)).sort();
  const last = entries[entries.length - 1];
  await cmdVerify({ snapshotId: last, flags: { config: cfgPath } });

  process.chdir(cwdBefore);
  console.log('SMOKE_OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
