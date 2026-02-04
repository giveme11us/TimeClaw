import path from 'node:path';
import { loadConfig } from '../config.js';
import { createSnapshot } from '../snapshot.js';

export async function cmdSnapshot({ flags }) {
  const { config } = await loadConfig({ configPath: flags.config, requireOpenclawRoot: true });
  const label = typeof flags.label === 'string' ? flags.label : null;
  const dryRun = !!flags['dry-run'] || !!flags.dryRun;

  const res = await createSnapshot({
    dest: config.dest,
    machineId: config.machineId,
    sourceRoot: config.sourceRoot,
    includes: config.includes,
    excludes: config.excludes,
    label,
    dryRun
  });

  console.log(JSON.stringify(res, null, 2));
}
