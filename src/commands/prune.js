import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { snapshotsDir } from '../layout.js';
import { pathExists, safeReadJson } from '../fsops.js';
import { classifySnapshots } from '../retention.js';

function tsFromId(id) {
  const m = id.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.(\d{3})Z$/);
  if (m) return Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  const m2 = id.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/);
  if (m2) return Date.parse(`${m2[1]}T${m2[2]}:${m2[3]}:${m2[4]}Z`);
  return Date.parse(id);
}

export async function cmdPrune({ flags }) {
  const { config } = await loadConfig({ configPath: flags.config, requireInitialized: true });
  const dryRun = !!flags['dry-run'] || !!flags.dryRun;

  const dir = snapshotsDir(config.dest, config.machineId);
  if (!(await pathExists(dir))) {
    console.log(JSON.stringify({ ok: true, removed: [], kept: [] }, null, 2));
    return;
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const snaps = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    snaps.push({ id: ent.name, tsMs: tsFromId(ent.name) });
  }

  const { keepIds } = classifySnapshots(snaps);
  const removed = [];
  const kept = [];

  for (const s of snaps) {
    if (keepIds.has(s.id)) kept.push(s.id);
    else removed.push(s.id);
  }

  if (!dryRun) {
    for (const id of removed) {
      // Safety: only remove under snapshotsDir
      await fs.rm(path.join(dir, id), { recursive: true, force: true });
    }
  }

  console.log(JSON.stringify({ ok: true, dryRun, kept, removed }, null, 2));
}
