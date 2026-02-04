import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { UserError } from '../src/errors.js';

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

async function main() {
  const cwdBefore = process.cwd();

  // Missing config in cwd
  const emptyDir = await mkTempDir('timeclaw-empty');
  process.chdir(emptyDir);
  await expectUserError(loadConfig({}), 'CONFIG_MISSING');

  // Missing dest in config
  const badCfgDir = await mkTempDir('timeclaw-badcfg');
  const badCfgPath = path.join(badCfgDir, 'timeclaw.config.json');
  await writeJson(badCfgPath, { sourceRoot: badCfgDir });
  await expectUserError(loadConfig({ configPath: badCfgPath }), 'CONFIG_MISSING_DEST');

  // Wrong OpenClaw root
  const wrongRootDir = await mkTempDir('timeclaw-wrongroot');
  const wrongCfgPath = path.join(wrongRootDir, 'timeclaw.config.json');
  await writeJson(wrongCfgPath, {
    dest: await mkTempDir('timeclaw-dest'),
    machineId: 'test',
    sourceRoot: wrongRootDir
  });
  await expectUserError(loadConfig({ configPath: wrongCfgPath, requireOpenclawRoot: true }), 'OPENCLAW_ROOT_MISSING');

  // Dest not initialized
  const notInitDir = await mkTempDir('timeclaw-notinit');
  const notInitCfgPath = path.join(notInitDir, 'timeclaw.config.json');
  await writeJson(notInitCfgPath, {
    dest: await mkTempDir('timeclaw-dest2'),
    machineId: 'test',
    sourceRoot: notInitDir
  });
  await expectUserError(loadConfig({ configPath: notInitCfgPath, requireInitialized: true }), 'DEST_NOT_INITIALIZED');

  process.chdir(cwdBefore);
  console.log('ERRORS_OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
