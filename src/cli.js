#!/usr/bin/env node
import { cmdInit } from './commands/init.js';
import { cmdSnapshot } from './commands/snapshot.js';
import { cmdList } from './commands/list.js';
import { cmdVerify } from './commands/verify.js';
import { cmdRestore } from './commands/restore.js';
import { cmdPrune } from './commands/prune.js';
import { cmdGc } from './commands/gc.js';
import { cmdSetup } from './commands/setup.js';

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

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
    console.log(`TimeClaw (timeclaw)\n\nCommands:\n  setup --dest <path> [--source <path>] [--machine <id>] [--config <path>] [--force]\n  init --dest <path> [--machine <id>] [--config <path>]\n  snapshot [--config <path>] [--label <text>] [--dry-run]\n  backup [--config <path>] [--label <text>] [--dry-run]   (alias of snapshot)\n  list [--config <path>]\n  verify <snapshotId> [--config <path>] [--migrate]\n  restore <snapshotId> [--config <path>] [--target <path>] [--dry-run] [--migrate]\n  prune [--config <path>] [--dry-run]\n  gc [--config <path>] [--dry-run]\n`);
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
        if (!args[0]) die('verify requires <snapshotId>');
        return await cmdVerify({ snapshotId: args[0], flags });
      case 'restore':
        if (!args[0]) die('restore requires <snapshotId>');
        return await cmdRestore({ snapshotId: args[0], flags });
      case 'prune':
        return await cmdPrune({ flags });
      case 'gc':
        return await cmdGc({ flags });
      default:
        die(`Unknown command: ${command}`);
    }
  } catch (err) {
    console.error(err?.stack || String(err));
    process.exit(1);
  }
}

await main();
