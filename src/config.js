import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_RETENTION } from './constants.js';

export async function loadConfig({ configPath }) {
  const resolved = await resolveConfigPath(configPath);
  const raw = await fs.readFile(resolved, 'utf8');
  const cfg = JSON.parse(raw);

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

  if (!out.dest) throw new Error('Config missing required field: dest');
  return { path: resolved, config: out };
}

export async function resolveConfigPath(configPath) {
  if (configPath) return path.resolve(configPath);
  const local = path.resolve(process.cwd(), 'timeclaw.config.json');
  try {
    await fs.access(local);
    return local;
  } catch {
    throw new Error('No config found. Provide --config <path> or create timeclaw.config.json in the current directory.');
  }
}
