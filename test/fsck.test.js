import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { cmdInit } from '../src/commands/init.js';
import { cmdSnapshot } from '../src/commands/snapshot.js';
import { cmdFsck } from '../src/commands/fsck.js';
import { UserError } from '../src/errors.js';

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

async function expectUserError(promise, code) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof UserError);
    assert.equal(err.code, code);
    return err;
  }
  throw new Error(`Expected UserError with code ${code}`);
}

async function main() {
  const dest = await mkTempDir('timeclaw-dest-fsck');
  const source = await mkTempDir('timeclaw-src-fsck');

  await fs.mkdir(path.join(source, 'memory'), { recursive: true });
  await fs.writeFile(path.join(source, 'openclaw.json'), '{"hello":true}\n');
  await fs.writeFile(path.join(source, 'memory', '2026-01-01.md'), 'fsck\n');

  const cfgPath = path.join(source, 'timeclaw.config.json');
  await writeJson(cfgPath, {
    dest,
    machineId: 'fsck-machine',
    sourceRoot: source,
    includes: ['openclaw.json', 'memory/**'],
    excludes: []
  });

  await cmdInit({ flags: { dest, machine: 'fsck-machine', config: cfgPath } });
  await cmdSnapshot({ flags: { config: cfgPath } });

  const snapsDir = path.join(dest, 'TimeClaw', 'machines', 'fsck-machine', 'snapshots');
  const entries = (await fs.readdir(snapsDir)).sort();
  const snapshotId = entries[entries.length - 1];
  const manifest = await readJson(path.join(snapsDir, snapshotId, 'manifest.json'));
  const firstHash = Object.values(manifest.sha256 || {})[0];
  if (!firstHash) throw new Error('missing manifest sha256 entry');

  const okReport = await cmdFsck({ flags: { config: cfgPath, json: true } });
  assert.equal(okReport.ok, true);
  assert.ok(okReport.snapshotsChecked >= 1);
  assert.ok(okReport.manifestsOk >= 1);
  assert.equal(okReport.missingObjects, 0);
  assert.equal(okReport.corruptObjects, 0);

  const objPath = path.join(dest, 'TimeClaw', 'machines', 'fsck-machine', 'objects', firstHash.slice(0, 2), firstHash);
  await fs.writeFile(objPath, 'corrupt\n');
  const corruptErr = await expectUserError(
    cmdFsck({ flags: { config: cfgPath, 'verify-hash': true, json: true } }),
    'FSCK_ERRORS'
  );
  assert.ok(corruptErr.report.corruptObjects > 0);

  await fs.rm(objPath, { force: true });
  const missingErr = await expectUserError(
    cmdFsck({ flags: { config: cfgPath, json: true } }),
    'FSCK_ERRORS'
  );
  assert.ok(missingErr.report.missingObjects > 0);

  console.log('FSCK_OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
