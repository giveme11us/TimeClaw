import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_RETENTION } from './constants.js';
import { markerPath } from './layout.js';
import { pathExists } from './fsops.js';
import { UserError } from './errors.js';

export async function loadConfig({ configPath, requireInitialized = false, requireOpenclawRoot = false } = {}) {
  const resolved = await resolveConfigPath(configPath);
  let raw = '';
  try {
    raw = await fs.readFile(resolved, 'utf8');
  } catch (err) {
    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      throw new UserError(`Cannot read config: ${resolved}`, {
        code: 'CONFIG_PERMISSION',
        exitCode: 5,
        hint: 'Check file permissions or move the config to a readable location.'
      });
    }
    if (err?.code === 'ENOENT') {
      throw new UserError(`Config file not found: ${resolved}`, {
        code: 'CONFIG_MISSING',
        exitCode: 3,
        hint: 'Run setup to create a config, or pass --config <path>.',
        next: 'timeclaw setup --dest <path>'
      });
    }
    throw err;
  }

  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    throw new UserError(`Invalid JSON in config: ${resolved}`, {
      code: 'CONFIG_INVALID',
      exitCode: 3,
      hint: 'Fix the JSON or re-run setup with --force to regenerate.'
    });
  }

  const out = {
    // where your OpenClaw data lives
    sourceRoot: cfg.sourceRoot ? path.resolve(cfg.sourceRoot) : process.cwd(),

    // destination root (external path)
    dest: cfg.dest ? path.resolve(cfg.dest) : null,

    machineId: cfg.machineId || os.hostname(),

    includes: Array.isArray(cfg.includes) ? cfg.includes : ['openclaw.json', 'workspace/skills', 'MEMORY.md', 'memory'],
    excludes: Array.isArray(cfg.excludes) ? cfg.excludes : ['workspace/tmp', 'media', 'tmp'],

    retention: { ...DEFAULT_RETENTION, ...(cfg.retention || {}) },

    // optional cap: when exceeded, prune oldest
    maxBytes: typeof cfg.maxBytes === 'number' ? cfg.maxBytes : null
  };

  if (!out.dest) {
    throw new UserError('Config missing required field: dest', {
      code: 'CONFIG_MISSING_DEST',
      exitCode: 3,
      hint: 'Add "dest" to timeclaw.config.json or re-run setup.',
      next: 'timeclaw setup --dest <path> --force'
    });
  }

  if (requireOpenclawRoot) {
    const openclaw = path.join(out.sourceRoot, 'openclaw.json');
    const parent = path.dirname(out.sourceRoot);
    let hint = 'Run setup with --source <openclaw root>, or update sourceRoot in the config.';
    let next = null;
    if (await pathExists(path.join(parent, 'openclaw.json'))) {
      hint = `Found openclaw.json in ${parent}. Update sourceRoot or re-run setup.`;
      next = `timeclaw setup --dest "${out.dest}" --source "${parent}" --force`;
    }
    if (!(await pathExists(openclaw))) {
      throw new UserError(`OpenClaw root not found: ${out.sourceRoot}`, {
        code: 'OPENCLAW_ROOT_MISSING',
        exitCode: 6,
        hint,
        next
      });
    }
  }

  if (requireInitialized) {
    const marker = markerPath(out.dest);
    if (!(await pathExists(marker))) {
      throw new UserError(`Destination not initialized: ${out.dest}`, {
        code: 'DEST_NOT_INITIALIZED',
        exitCode: 4,
        hint: 'Run setup or init to create the TimeClaw marker.',
        next: `timeclaw init --dest "${out.dest}"`
      });
    }
  }

  return { path: resolved, config: out };
}

export async function resolveConfigPath(configPath) {
  if (configPath) return path.resolve(configPath);
  const local = path.resolve(process.cwd(), 'timeclaw.config.json');
  try {
    await fs.access(local);
    return local;
  } catch {
    throw new UserError('No config found in the current directory.', {
      code: 'CONFIG_MISSING',
      exitCode: 3,
      hint: 'Run setup to create a config, or pass --config <path>.',
      next: 'timeclaw setup --dest <path>'
    });
  }
}
