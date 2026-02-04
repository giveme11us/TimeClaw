#!/usr/bin/env node
import { cmdInit } from './commands/init.js';
import { cmdSnapshot } from './commands/snapshot.js';
import { cmdList } from './commands/list.js';
import { cmdVerify } from './commands/verify.js';
import { cmdRestore } from './commands/restore.js';
import { cmdPrune } from './commands/prune.js';
import { cmdGc } from './commands/gc.js';
import { cmdSetup } from './commands/setup.js';
import { UserError, asUserError, formatUserError } from './errors.js';

const USAGE = `TimeClaw (timeclaw)

Commands:
  setup --dest <path> [--source <path>] [--machine <id>] [--config <path>] [--force]
  init --dest <path> [--machine <id>] [--config <path>]
  snapshot [--config <path>] [--label <text>] [--dry-run]
  backup [--config <path>] [--label <text>] [--dry-run]   (alias of snapshot)
  list [--config <path>]
  verify <snapshotId> [--config <path>] [--migrate]
  restore <snapshotId> [--config <path>] [--target <path>] [--dry-run] [--migrate]
  prune [--config <path>] [--dry-run]
  gc [--config <path>] [--dry-run]
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = [];
  const flags = {};

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(a);
    }
  }

  return { command, args, flags };
}

async function main() {
  const { command, args, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || flags.help) {
    console.log(USAGE);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'setup':
        return await cmdSetup({ flags });
      case 'init':
        return await cmdInit({ flags });
      case 'snapshot':
      case 'backup':
        return await cmdSnapshot({ flags });
      case 'list':
        return await cmdList({ flags });
      case 'verify':
        if (!args[0]) {
          throw new UserError('verify requires <snapshotId>', {
            code: 'USAGE',
            exitCode: 2,
            hint: 'Provide a snapshot id from the list command.',
            next: 'timeclaw list'
          });
        }
        return await cmdVerify({ snapshotId: args[0], flags });
      case 'restore':
        if (!args[0]) {
          throw new UserError('restore requires <snapshotId>', {
            code: 'USAGE',
            exitCode: 2,
            hint: 'Provide a snapshot id from the list command.',
            next: 'timeclaw list'
          });
        }
        return await cmdRestore({ snapshotId: args[0], flags });
      case 'prune':
        return await cmdPrune({ flags });
      case 'gc':
        return await cmdGc({ flags });
      default:
        throw new UserError(`Unknown command: ${command}`, {
          code: 'USAGE',
          exitCode: 2,
          hint: 'Run timeclaw help to see available commands.',
          next: 'timeclaw help'
        });
    }
  } catch (err) {
    const normalized = asUserError(err, { action: 'running timeclaw' }) || err;
    if (normalized instanceof UserError) {
      console.error(formatUserError(normalized));
      process.exit(normalized.exitCode || 1);
    }
    console.error(err?.stack || String(err));
    process.exit(1);
  }
}

await main();
