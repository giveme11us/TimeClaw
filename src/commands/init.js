import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureDir, safeWriteJson } from '../fsops.js';
import { initDest } from '../snapshot.js';
import { machineRoot } from '../layout.js';
import { UserError } from '../errors.js';

export async function cmdInit({ flags }) {
  const dest = flags.dest ? path.resolve(flags.dest) : null;
  if (!dest) {
    throw new UserError('init requires --dest <path>', {
      code: 'USAGE',
      exitCode: 2,
      hint: 'Provide a destination path for snapshots.',
      next: 'timeclaw init --dest <path>'
    });
  }

  const machineId = flags.machine || flags.machineId || os.hostname();
  const configPath = flags.config ? path.resolve(flags.config) : path.resolve(process.cwd(), 'timeclaw.config.json');

  // init destination marker + machine dirs
  await initDest({ dest });
  await ensureDir(machineRoot(dest, machineId));

  // write a starter config if it does not exist
  try {
    await fs.access(configPath);
  } catch {
    const cfg = {
      dest,
      machineId,
      sourceRoot: process.cwd(),
      presets: ['openclaw'],
      retention: { hourlyHours: 24, dailyDays: 30, weeklyWeeks: 520 }
    };
    await safeWriteJson(configPath, cfg);
  }

  console.log(
    JSON.stringify(
      { ok: true, dest, machineId, config: configPath, next: 'timeclaw snapshot' },
      null,
      2
    )
  );
}
