import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { initDest } from '../snapshot.js';
import { safeWriteJson } from '../fsops.js';

function guessOpenclawRoot(cwd) {
  // Best-effort heuristic:
  // - if cwd contains openclaw.json -> cwd
  // - else if cwd ends with workspace -> parent
  // - else fallback to cwd
  return cwd;
}

export async function cmdSetup({ flags }) {
  const cwd = process.cwd();

  const dest = flags.dest ? path.resolve(String(flags.dest)) : null;
  if (!dest) throw new Error('setup requires --dest <path>');

  const machineId = String(flags.machine || flags.machineId || os.hostname());

  const configPath = flags.config
    ? path.resolve(String(flags.config))
    : path.resolve(cwd, 'timeclaw.config.json');

  const sourceRoot = flags.source
    ? path.resolve(String(flags.source))
    : guessOpenclawRoot(cwd);

  // Initialize destination marker (safety jail)
  await initDest({ dest });

  // Create a default config (overwrite only if --force)
  const force = !!flags.force;
  try {
    await fs.access(configPath);
    if (!force) {
      throw new Error(`Config already exists at ${configPath}. Re-run with --force to overwrite.`);
    }
  } catch {
    // ok
  }

  const cfg = {
    dest,
    machineId,
    sourceRoot,
    includes: ['openclaw.json', 'workspace/skills', 'MEMORY.md', 'memory'],
    excludes: ['workspace/tmp', 'media', 'tmp'],
    retention: { hourlyHours: 24, dailyDays: 30, weeklyWeeks: 520 }
  };

  await safeWriteJson(configPath, cfg);
  console.log(JSON.stringify({ ok: true, action: 'setup', config: configPath, dest, machineId, sourceRoot }, null, 2));
}
