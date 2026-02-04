import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { initDest } from '../snapshot.js';
import { safeWriteJson } from '../fsops.js';
import { UserError } from '../errors.js';

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function guessOpenclawRoot(cwd) {
  // Best-effort heuristic:
  // - if cwd contains openclaw.json -> cwd
  // - else if cwd ends with "workspace" and parent contains openclaw.json -> parent
  // - else if parent contains openclaw.json -> parent
  // - else fallback to cwd
  const here = path.resolve(cwd);
  const parent = path.dirname(here);

  if (await pathExists(path.join(here, 'openclaw.json'))) return here;

  if (path.basename(here).toLowerCase() === 'workspace') {
    if (await pathExists(path.join(parent, 'openclaw.json'))) return parent;
  }

  if (await pathExists(path.join(parent, 'openclaw.json'))) return parent;

  return here;
}

export async function cmdSetup({ flags }) {
  const cwd = process.cwd();

  const dest = flags.dest ? path.resolve(String(flags.dest)) : null;
  if (!dest) {
    throw new UserError('setup requires --dest <path>', {
      code: 'USAGE',
      exitCode: 2,
      hint: 'Provide a destination path for snapshots.',
      next: 'timeclaw setup --dest <path>'
    });
  }

  const machineId = String(flags.machine || flags.machineId || os.hostname());

  const configPath = flags.config
    ? path.resolve(String(flags.config))
    : path.resolve(cwd, 'timeclaw.config.json');

  const sourceRoot = flags.source
    ? path.resolve(String(flags.source))
    : await guessOpenclawRoot(cwd);

  // Initialize destination marker (safety jail)
  await initDest({ dest });

  // Create a default config (overwrite only if --force)
  const force = !!flags.force;
  try {
    await fs.access(configPath);
    if (!force) {
      throw new UserError(`Config already exists at ${configPath}`, {
        code: 'CONFIG_EXISTS',
        exitCode: 3,
        hint: 'Re-run with --force to overwrite.',
        next: `timeclaw setup --dest "${dest}" --force`
      });
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
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: 'setup',
        config: configPath,
        dest,
        machineId,
        sourceRoot,
        next: 'timeclaw snapshot'
      },
      null,
      2
    )
  );
}
