import path from 'node:path';
import { loadConfig } from '../config.js';
import { importSnapshotPack } from '../pack.js';
import { UserError } from '../errors.js';

export async function cmdImport({ packPath, flags }) {
  if (!packPath) {
    throw new UserError('import requires <packPath>', {
      code: 'USAGE',
      exitCode: 2,
      hint: 'Provide the path to a pack file created by timeclaw export.'
    });
  }

  const { config } = await loadConfig({ configPath: flags.config, requireInitialized: true });
  const force = !!flags.force;

  const res = await importSnapshotPack({
    dest: config.dest,
    machineId: config.machineId,
    packPath: path.resolve(packPath),
    force
  });

  console.log(JSON.stringify(res, null, 2));
}
