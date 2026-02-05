import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { cmdInit } from '../src/commands/init.js';
import { cmdSnapshot } from '../src/commands/snapshot.js';
import { cmdDiff } from '../src/commands/diff.js';
import { UserError } from '../src/errors.js';

async function mkTempDir(prefix) {
  const d = path.join(os.tmpdir(), prefix + '-' + crypto.randomBytes(4).toString('hex'));
  await fs.mkdir(d, { recursive: true });
  return d;
}

async function writeJson(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj, null, 2));
}

async function captureOutput(fn) {
  const logs = [];
  const errors = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return { logs, errors };
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

async function main() {
  const dest = await mkTempDir('timeclaw-dest-diff');
  const source = await mkTempDir('timeclaw-src-diff');

  await fs.writeFile(path.join(source, 'openclaw.json'), '{"hello":true}\n');
  await fs.writeFile(path.join(source, 'a.txt'), 'one\n');
  await fs.writeFile(path.join(source, 'b.txt'), 'two\n');

  const cfgPath = path.join(source, 'timeclaw.config.json');
  await writeJson(cfgPath, {
    dest,
    machineId: 'diff-machine',
    sourceRoot: source,
    includes: ['**'],
    excludes: ['timeclaw.config.json']
  });

  await cmdInit({ flags: { dest, machine: 'diff-machine', config: cfgPath } });
  await cmdSnapshot({ flags: { config: cfgPath } });

  await fs.writeFile(path.join(source, 'a.txt'), 'one updated\n');
  await fs.unlink(path.join(source, 'b.txt'));
  await fs.writeFile(path.join(source, 'c.txt'), 'three\n');

  await cmdSnapshot({ flags: { config: cfgPath } });

  const snapsDir = path.join(dest, 'TimeClaw', 'machines', 'diff-machine', 'snapshots');
  const entries = (await fs.readdir(snapsDir)).sort();
  const snapA = entries[0];
  const snapB = entries[entries.length - 1];

  const { logs } = await captureOutput(() =>
    cmdDiff({ snapshotA: snapA, snapshotB: snapB, flags: { config: cfgPath, json: true } })
  );

  const payload = JSON.parse(logs[logs.length - 1]);
  assert.deepEqual(payload.added, ['c.txt']);
  assert.deepEqual(payload.removed, ['b.txt']);
  assert.deepEqual(payload.changed, ['a.txt']);
  assert.equal(payload.summary.totalA, 3);
  assert.equal(payload.summary.totalB, 3);

  const legacyId = '2026-02-01T00-00-00.000Z';
  const legacyDir = path.join(snapsDir, legacyId);
  await fs.mkdir(legacyDir, { recursive: true });
  await fs.writeFile(path.join(legacyDir, 'openclaw.json'), '{"legacy":true}\n');

  await expectUserError(
    cmdDiff({ snapshotA: legacyId, snapshotB: snapB, flags: { config: cfgPath, json: true } }),
    'SNAPSHOT_LEGACY'
  );

  console.log('DIFF_OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
