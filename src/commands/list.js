import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { snapshotsDir } from '../layout.js';
import { pathExists, safeReadJson } from '../fsops.js';
import { detectSnapshotLayout } from '../legacy.js';

function tsFromId(id) {
  // id is ISO with ':' replaced by '-'
  const iso = id.replace(/-/g, (m, offset) => {
    // naive: turn first 2 dashes after T back to ':' not possible without parsing.
    return '-';
  });
  // best-effort: Date.parse works for full ISO; ours has dashes in time; replace 'T..Z' time dashes to ':'
  const m = id.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.(\d{3})Z$/);
  if (m) return Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  const m2 = id.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/);
  if (m2) return Date.parse(`${m2[1]}T${m2[2]}:${m2[3]}:${m2[4]}Z`);
  return Date.parse(id);
}

export async function cmdList({ flags }) {
  const { config } = await loadConfig({ configPath: flags.config });
  const dir = snapshotsDir(config.dest, config.machineId);
  if (!(await pathExists(dir))) {
    console.log(JSON.stringify({ snapshots: [] }, null, 2));
    return;
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const snaps = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const id = ent.name;
    const snapDir = path.join(dir, id);
    const manifestPath = path.join(snapDir, 'manifest.json');
    let manifest = null;
    let legacy = false;

    if (await pathExists(manifestPath)) {
      try { manifest = await safeReadJson(manifestPath); } catch {}
    }

    if (!manifest || !manifest.sha256) {
      const layout = await detectSnapshotLayout(snapDir);
      legacy = layout.layout === 'legacy-tree';
      if (layout.layout === 'cas' && layout.manifest) {
        manifest = layout.manifest;
      }
    }

    snaps.push({ id, tsMs: tsFromId(id), manifest, legacy });
  }

  snaps.sort((a, b) => a.tsMs - b.tsMs);
  console.log(JSON.stringify({ snapshots: snaps.map(({ id, tsMs, manifest, legacy }) => ({ id, tsMs, label: manifest?.label || null, files: manifest?.stats?.files ?? null, legacy })) }, null, 2));
}
