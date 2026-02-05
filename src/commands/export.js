import path from 'node:path';
import { loadConfig } from '../config.js';
import { exportSnapshotPack } from '../pack.js';
import { UserError } from '../errors.js';

export async function cmdExport({ snapshotId, flags }) {
  if (!snapshotId) {
    throw new UserError('export requires <snapshotId>', {
      code: 'USAGE',
      exitCode: 2,
      hint: 'Provide a snapshot id from the list command.',
      next: 'timeclaw list'
    });
  }

  const { config } = await loadConfig({ configPath: flags.config, requireInitialized: true });
  const outPath = flags.out ? path.resolve(flags.out) : null;

  const res = await exportSnapshotPack({
    dest: config.dest,
    machineId: config.machineId,
    snapshotId,
    outPath
  });

  console.log(JSON.stringify(res, null, 2));
}
