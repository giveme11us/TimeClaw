import path from 'node:path';
import { loadConfig } from '../config.js';
import { UserError } from '../errors.js';
import { snapshotsDir } from '../layout.js';
import { pathExists, safeReadJson } from '../fsops.js';
import { detectSnapshotLayout } from '../legacy.js';

export async function cmdDiff({ snapshotA, snapshotB, flags }) {
  const { config } = await loadConfig({ configPath: flags.config, requireInitialized: true });
  if (!snapshotA || !snapshotB) {
    throw new UserError('diff requires <snapshotA> and <snapshotB>', {
      code: 'USAGE',
      exitCode: 2,
      hint: 'Provide two snapshot ids from the list command.',
      next: 'timeclaw list'
    });
  }

  const base = snapshotsDir(config.dest, config.machineId);
  const snapDirA = path.join(base, snapshotA);
  const snapDirB = path.join(base, snapshotB);

  const manifestA = await readManifestOrThrow({ snapshotId: snapshotA, snapDir: snapDirA });
  const manifestB = await readManifestOrThrow({ snapshotId: snapshotB, snapDir: snapDirB });

  const { added, removed, changed, summary } = diffManifests(manifestA, manifestB);
  const output = { added, removed, changed, summary };

  if (flags.json || flags['json']) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  console.log(renderHumanDiff({ snapshotA, snapshotB, added, removed, changed, summary }));
  return output;
}

async function readManifestOrThrow({ snapshotId, snapDir }) {
  if (!(await pathExists(snapDir))) {
    throw new UserError(`Snapshot not found: ${snapshotId}`, {
      code: 'SNAPSHOT_NOT_FOUND',
      exitCode: 6,
      hint: 'Run list to see available snapshots.',
      next: 'timeclaw list'
    });
  }

  const layout = await detectSnapshotLayout(snapDir);
  if (layout.layout !== 'cas') {
    if (layout.layout === 'legacy-tree') {
      throw new UserError(`Snapshot uses legacy layout: ${snapshotId}`, {
        code: 'SNAPSHOT_LEGACY',
        exitCode: 6,
        hint: `Run timeclaw verify ${snapshotId} --migrate to convert the snapshot.`,
        next: `timeclaw verify ${snapshotId} --migrate`
      });
    }
    throw new UserError(`Snapshot is empty: ${snapshotId}`, {
      code: 'SNAPSHOT_EMPTY',
      exitCode: 6,
      hint: 'The snapshot directory exists but contains no files or manifest.',
      next: 'timeclaw list'
    });
  }

  if (layout.manifest) return layout.manifest;
  return await safeReadJson(layout.manifestPath);
}

function diffManifests(manifestA, manifestB) {
  const mapA = manifestA?.sha256 && typeof manifestA.sha256 === 'object' ? manifestA.sha256 : {};
  const mapB = manifestB?.sha256 && typeof manifestB.sha256 === 'object' ? manifestB.sha256 : {};

  const keysA = Object.keys(mapA);
  const keysB = Object.keys(mapB);
  const setA = new Map(keysA.map((key) => [key, String(mapA[key])]));
  const setB = new Map(keysB.map((key) => [key, String(mapB[key])]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, hashB] of setB.entries()) {
    if (!setA.has(key)) {
      added.push(key);
    } else if (setA.get(key) !== hashB) {
      changed.push(key);
    }
  }

  for (const key of setA.keys()) {
    if (!setB.has(key)) removed.push(key);
  }

  added.sort();
  removed.sort();
  changed.sort();

  const summary = {
    added: added.length,
    removed: removed.length,
    changed: changed.length,
    totalA: keysA.length,
    totalB: keysB.length
  };

  return { added, removed, changed, summary };
}

function renderHumanDiff({ snapshotA, snapshotB, added, removed, changed, summary }) {
  const lines = [];
  lines.push(`Diff ${snapshotA} -> ${snapshotB}`);
  lines.push(formatSection('Added', added));
  lines.push(formatSection('Removed', removed));
  lines.push(formatSection('Changed', changed));
  lines.push(
    `Summary: added ${summary.added}, removed ${summary.removed}, changed ${summary.changed}, totalA ${summary.totalA}, totalB ${summary.totalB}`
  );
  return lines.join('\n');
}

function formatSection(label, items) {
  const lines = [`${label} (${items.length})`];
  if (items.length === 0) {
    lines.push('  (none)');
    return lines.join('\n');
  }
  for (const item of items) {
    lines.push(`  ${item}`);
  }
  return lines.join('\n');
}
