import path from 'node:path';
import { loadConfig } from '../config.js';
import { snapshotsDir, objectsDir } from '../layout.js';
import { pathExists, safeReadJson, sha256File } from '../fsops.js';
import { detectSnapshotLayout, listLegacySnapshotFiles, migrateLegacySnapshot } from '../legacy.js';

export async function cmdVerify({ snapshotId, flags }) {
  const { config } = await loadConfig({ configPath: flags.config });
  const migrate = !!flags.migrate || !!flags['migrate-legacy'] || !!flags.migrateLegacy;
  const base = path.join(snapshotsDir(config.dest, config.machineId), snapshotId);
  if (!(await pathExists(base))) throw new Error(`snapshot not found: ${base}`);

  const layout = await detectSnapshotLayout(base);

  if (layout.layout !== 'cas') {
    if (layout.layout === 'legacy-tree') {
      if (migrate) {
        const result = await migrateLegacySnapshot({ snapshotDir: base, dest: config.dest, machineId: config.machineId, snapshotId });
        layout.layout = 'cas';
        layout.manifest = result.manifest;
        layout.manifestPath = path.join(base, 'manifest.json');
      } else {
        const files = await listLegacySnapshotFiles(base);
        console.warn(`Warning: legacy snapshot layout detected for ${snapshotId}; no manifest to verify. Use --migrate to convert.`);
        console.log(JSON.stringify({ ok: null, snapshotId, legacy: true, verified: false, files: files.length }, null, 2));
        return;
      }
    } else {
      throw new Error(`manifest not found and snapshot is empty: ${base}`);
    }
  }

  const manifest = layout.manifest || (await safeReadJson(layout.manifestPath));
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
