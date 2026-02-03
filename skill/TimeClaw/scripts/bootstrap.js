#!/usr/bin/env node
/**
 * TimeClaw Skill Bootstrapper
 *
 * Purpose:
 * - Installed via a .skill (Clawhub)
 * - Clones/pulls the canonical TimeClaw repo
 * - Runs the TimeClaw CLI
 *
 * Safety:
 * - Only ever targets the canonical repo remote.
 * - Never runs destructive disk operations.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const CANONICAL_REPO = 'https://github.com/giveme11us/TimeClaw.git';

function log(s) {
  process.stdout.write(String(s) + '\n');
}

function die(msg, code = 1) {
  process.stderr.write(String(msg) + '\n');
  process.exit(code);
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function defaultShellFor(cmd) {
  if (process.platform !== 'win32') return false;
  const c = String(cmd).toLowerCase();
  // .cmd/.bat need a shell on Windows.
  if (c.endsWith('.cmd') || c.endsWith('.bat')) return true;
  // git resolves fine either way, but shell avoids PATH quirks in some environments.
  if (c === 'git') return true;
  return false;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const useShell = Object.prototype.hasOwnProperty.call(opts, 'shell')
      ? opts.shell
      : defaultShellFor(cmd);

    const p = spawn(cmd, args, { stdio: 'inherit', shell: useShell, ...opts });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function defaultInstallDir() {
  // cross-platform, user-owned, stable
  return path.join(os.homedir(), '.openclaw', 'tools', 'timeclaw');
}

async function readText(p) {
  return fs.readFile(p, 'utf8');
}

async function getRepoRemote(repoDir) {
  // git config --get remote.origin.url
  return new Promise((resolve) => {
    const p = spawn('git', ['config', '--get', 'remote.origin.url'], { cwd: repoDir, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString('utf8')));
    p.on('exit', () => resolve(out.trim()));
  });
}

async function assertCanonicalRemote(repoDir) {
  const remote = await getRepoRemote(repoDir);
  if (!remote) die(`TimeClaw bootstrap: missing origin remote in ${repoDir}`);
  // Allow token-injected https remotes too, as long as host/path matches.
  const normalized = remote.replace(/^https:\/\/[^@]+@github\.com\//, 'https://github.com/');
  if (normalized !== CANONICAL_REPO) {
    die(`TimeClaw bootstrap: refusing to operate on non-canonical remote.\n  found: ${remote}\n  expected: ${CANONICAL_REPO}`);
  }
}

function npmBin() {
  // On Windows, npm is typically npm.cmd
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function installOrUpdate({ repoDir, update }) {
  const gitDir = path.join(repoDir, '.git');
  if (!(await exists(gitDir))) {
    await ensureDir(path.dirname(repoDir));
    log(`TimeClaw: cloning ${CANONICAL_REPO} -> ${repoDir}`);
    await run('git', ['clone', '--depth', '1', CANONICAL_REPO, repoDir]);
  } else {
    await assertCanonicalRemote(repoDir);
    if (update) {
      log('TimeClaw: pulling latest...');
      await run('git', ['pull', '--ff-only'], { cwd: repoDir });
    }
  }

  // Install deps if package-lock exists; otherwise plain install.
  const pkg = path.join(repoDir, 'package.json');
  if (!(await exists(pkg))) die(`TimeClaw bootstrap: missing package.json in ${repoDir}`);

  const lock = path.join(repoDir, 'package-lock.json');
  log('TimeClaw: installing dependencies...');
  const npm = npmBin();
  if (await exists(lock)) {
    await run(npm, ['ci'], { cwd: repoDir });
  } else {
    await run(npm, ['install'], { cwd: repoDir });
  }
}

function parse(argv) {
  const args = [...argv];
  const out = { cmd: null, flags: {}, passthrough: [] };

  out.cmd = args.shift() || 'help';

  while (args.length) {
    const a = args[0];
    if (a === '--') {
      args.shift();
      out.passthrough = args.splice(0);
      break;
    }
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = args[1] && !args[1].startsWith('--') ? args[1] : true;
      out.flags[k] = v;
      args.shift();
      if (v !== true) args.shift();
      continue;
    }
    // unknown -> passthrough
    out.passthrough = args.splice(0);
    break;
  }

  return out;
}

async function main() {
  const callerCwd = process.cwd();
  const parsed = parse(process.argv.slice(2));
  const repoDir = path.resolve(String(parsed.flags.dir || defaultInstallDir()));

  switch (parsed.cmd) {
    case 'help': {
      log(`TimeClaw bootstrap\n\nUsage:\n  node bootstrap.js install [--dir <path>]\n  node bootstrap.js update [--dir <path>]\n  node bootstrap.js run [--dir <path>] [--no-update] -- <timeclaw args...>\n\nCanonical repo: ${CANONICAL_REPO}\nDefault install dir: ${defaultInstallDir()}\n`);
      return;
    }

    case 'install': {
      await installOrUpdate({ repoDir, update: false });
      log(JSON.stringify({ ok: true, action: 'install', repoDir }, null, 2));
      return;
    }

    case 'update': {
      await installOrUpdate({ repoDir, update: true });
      log(JSON.stringify({ ok: true, action: 'update', repoDir }, null, 2));
      return;
    }

    case 'run': {
      // By default, keep the installed repo up-to-date so agent-first users always get the latest.
      // Use --no-update to skip pulling.
      const noUpdate = !!parsed.flags['no-update'] || !!parsed.flags.noUpdate;
      await installOrUpdate({ repoDir, update: !noUpdate });
      await assertCanonicalRemote(repoDir);
      const cli = path.join(repoDir, 'src', 'cli.js');
      if (!(await exists(cli))) die(`TimeClaw bootstrap: missing CLI at ${cli}`);

      // run node cli with passthrough args
      // Run Node without shell so paths with spaces (Program Files) work on Windows.
      // Run from the caller's working directory so relative config (timeclaw.config.json) lives with the user's OpenClaw workspace.
      await run(process.execPath, [cli, ...parsed.passthrough], { cwd: callerCwd, shell: false });
      return;
    }

    default:
      die(`Unknown bootstrap command: ${parsed.cmd}`);
  }
}

main().catch((e) => die(e?.stack || String(e)));
