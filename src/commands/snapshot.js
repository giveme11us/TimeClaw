import { loadConfig } from '../config.js';
import { createSnapshot } from '../snapshot.js';
import { withMachineLock } from '../lock.js';

export async function cmdSnapshot({ flags }) {
  const { config } = await loadConfig({ configPath: flags.config, requireOpenclawRoot: true });
  const label = typeof flags.label === 'string' ? flags.label : null;
  const dryRun = !!flags['dry-run'] || !!flags.dryRun;
  const forceLock = !!flags['force-lock'] || !!flags.forceLock;

  const res = await withMachineLock(
    { dest: config.dest, machineId: config.machineId, command: 'snapshot', force: forceLock },
    () => createSnapshot({
      dest: config.dest,
      machineId: config.machineId,
      sourceRoot: config.sourceRoot,
      includes: config.includes,
      excludes: config.excludes,
      label,
      dryRun
    })
  );

  console.log(JSON.stringify(res, null, 2));
}
