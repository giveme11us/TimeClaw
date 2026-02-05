import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { cmdInit } from '../src/commands/init.js';
import { cmdSnapshot } from '../src/commands/snapshot.js';
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
  const dest = await mkTempDir('timeclaw-dest-balanced');
  const source = await mkTempDir('timeclaw-src-balanced');

  await fs.mkdir(path.join(source, 'workspace', 'projects', 'demo'), { recursive: true });
  await fs.mkdir(path.join(source, 'workspace', 'projects', 'demo', 'node_modules', 'pkg'), { recursive: true });
  await fs.mkdir(path.join(source, 'workspace', 'projects', 'demo', '.git'), { recursive: true });
  await fs.mkdir(path.join(source, 'memory'), { recursive: true });

  await fs.writeFile(path.join(source, 'openclaw.json'), '{"hello":true}\n');
  await fs.writeFile(path.join(source, 'MEMORY.md'), '# hi\n');
  await fs.writeFile(path.join(source, 'memory', '2026-01-01.md'), 'x\n');

  await fs.writeFile(path.join(source, 'workspace', 'projects', 'demo', 'notes.txt'), 'keep me\n');
  await fs.writeFile(
    path.join(source, 'workspace', 'projects', 'demo', 'node_modules', 'pkg', 'index.js'),
    'console.log("nope")\n'
  );
  await fs.writeFile(path.join(source, 'workspace', 'projects', 'demo', '.git', 'config'), 'nope\n');

  const cfgPath = path.join(source, 'timeclaw.config.json');
  await writeJson(cfgPath, {
    dest,
    machineId: 'balanced-machine',
    sourceRoot: source,
    preset: 'openclaw_balanced'
  });

  const cwdBefore = process.cwd();
  process.chdir(source);

  await cmdInit({ flags: { dest, machine: 'balanced-machine', config: cfgPath } });
  await cmdSnapshot({ flags: { config: cfgPath } });

  const snapsDir = path.join(dest, 'TimeClaw', 'machines', 'balanced-machine', 'snapshots');
  const entries = (await fs.readdir(snapsDir)).sort();
  const snapshotId = entries[entries.length - 1];
  await cmdVerify({ snapshotId, flags: { config: cfgPath } });

  const manifest = await readJson(path.join(snapsDir, snapshotId, 'manifest.json'));
  const keys = Object.keys(manifest.sha256 || {}).sort();

  if (!keys.includes('workspace/projects/demo/notes.txt')) {
    throw new Error('missing workspace file outside skills');
  }
  if (keys.includes('workspace/projects/demo/node_modules/pkg/index.js')) {
    throw new Error('node_modules file should be excluded');
  }
  if (keys.includes('workspace/projects/demo/.git/config')) {
    throw new Error('.git file should be excluded');
  }

  process.chdir(cwdBefore);
  console.log('BALANCED_OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
