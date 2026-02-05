import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { cmdInit } from '../src/commands/init.js';
import { cmdList } from '../src/commands/list.js';
import { UserError } from '../src/errors.js';
import { lockDir } from '../src/layout.js';

async function mkTempDir(prefix) {
  const d = path.join(os.tmpdir(), prefix + '-' + crypto.randomBytes(4).toString('hex'));
  await fs.mkdir(d, { recursive: true });
  return d;
}

async function writeJson(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj, null, 2));
}

async function expectUserError(promise, code) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof UserError);
    assert.equal(err.code, code);
    return;
  }
  throw new Error(`Expected UserError with code ${code}`);
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const cwdBefore = process.cwd();
  const dest = await mkTempDir('timeclaw-dest');
  const source = await mkTempDir('timeclaw-src');

  await fs.mkdir(path.join(source, 'memory'), { recursive: true });
  await fs.writeFile(path.join(source, 'openclaw.json'), '{"hello":true}\n');
  await fs.writeFile(path.join(source, 'MEMORY.md'), '# hi\n');
  await fs.writeFile(path.join(source, 'memory', '2026-01-01.md'), 'x\n');

  const cfgPath = path.join(source, 'timeclaw.config.json');
  await writeJson(cfgPath, {
    dest,
    machineId: 'test-machine',
    sourceRoot: source
  });

  process.chdir(source);
  await cmdInit({ flags: { dest, machine: 'test-machine', config: cfgPath } });

  const lockBase = lockDir(dest, 'test-machine');
  await fs.mkdir(lockBase, { recursive: true });
  await fs.writeFile(
    path.join(lockBase, 'lock.json'),
    JSON.stringify(
      {
        pid: 123,
        hostname: 'test-host',
        startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        command: 'snapshot'
      },
      null,
      2
    )
  );

  await expectUserError(cmdList({ flags: { config: cfgPath } }), 'LOCKED');
  await cmdList({ flags: { config: cfgPath, 'force-lock': true } });

  const stillThere = await pathExists(lockBase);
  assert.equal(stillThere, false);

  process.chdir(cwdBefore);
  console.log('LOCK_OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
