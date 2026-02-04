import path from 'node:path';
import { loadConfig } from '../config.js';
import { UserError } from '../errors.js';
import { snapshotsDir, objectsDir } from '../layout.js';
import { pathExists, safeReadJson, sha256File } from '../fsops.js';

export async function cmdVerify({ snapshotId, flags }) {
  const { config } = await loadConfig({ configPath: flags.config, requireInitialized: true });
  const base = path.join(snapshotsDir(config.dest, config.machineId), snapshotId);
  const manifestPath = path.join(base, 'manifest.json');
  if (!(await pathExists(manifestPath))) {
    throw new UserError(`Snapshot not found: ${snapshotId}`, {
      code: 'SNAPSHOT_NOT_FOUND',
      exitCode: 6,
      hint: 'Run list to see available snapshots.',
      next: 'timeclaw list'
    });
  }

  const manifest = await safeReadJson(manifestPath);
  const checks = [];
  let ok = true;

  for (const [rel, expected] of Object.entries(manifest.sha256 || {})) {
    const hash = String(expected);
    const obj = path.join(objectsDir(config.dest, config.machineId), hash.slice(0, 2), hash);
    try {
      const got = await sha256File(obj);
      const match = got === hash;
      if (!match) ok = false;
      checks.push({ rel, match });
    } catch (e) {
      ok = false;
      checks.push({ rel, match: false, error: String(e?.message || e) });
    }
  }

  console.log(JSON.stringify({ ok, snapshotId, checked: checks.length, checks }, null, 2));
}
