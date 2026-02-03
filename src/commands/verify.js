import path from 'node:path';
import { loadConfig } from '../config.js';
import { snapshotsDir } from '../layout.js';
import { pathExists, safeReadJson, sha256File } from '../fsops.js';

export async function cmdVerify({ snapshotId, flags }) {
  const { config } = await loadConfig({ configPath: flags.config });
  const base = path.join(snapshotsDir(config.dest, config.machineId), snapshotId);
  const manifestPath = path.join(base, 'manifest.json');
  if (!(await pathExists(manifestPath))) throw new Error(`manifest not found: ${manifestPath}`);

  const manifest = await safeReadJson(manifestPath);
  const checks = [];
  let ok = true;

  for (const [rel, expected] of Object.entries(manifest.sha256 || {})) {
    const fp = path.join(base, rel);
    try {
      const got = await sha256File(fp);
      const match = got === expected;
      if (!match) ok = false;
      checks.push({ rel, match });
    } catch (e) {
      ok = false;
      checks.push({ rel, match: false, error: String(e?.message || e) });
    }
  }

  console.log(JSON.stringify({ ok, snapshotId, checked: checks.length, checks }, null, 2));
}
