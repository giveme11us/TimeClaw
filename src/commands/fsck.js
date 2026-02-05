import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { UserError } from '../errors.js';
import { snapshotsDir, objectsDir } from '../layout.js';
import { pathExists, sha256File } from '../fsops.js';

function toBoolFlag(flags, key) {
  return !!flags[key] || !!flags[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
}

export async function cmdFsck({ flags }) {
  const { config } = await loadConfig({ configPath: flags.config, requireInitialized: true });
  const verifyHash = toBoolFlag(flags, 'verify-hash');
  const jsonOut = !!flags.json;

  const snapsBase = snapshotsDir(config.dest, config.machineId);
  const objsBase = objectsDir(config.dest, config.machineId);

  const invalidManifests = [];
  const missingManifests = [];
  const missing = [];
  const corrupt = [];

  let snapshotsChecked = 0;
  let manifestsOk = 0;
  let missingObjects = 0;
  let corruptObjects = 0;

  if (await pathExists(snapsBase)) {
    const entries = await fs.readdir(snapsBase, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      snapshotsChecked++;
      const snapshotId = ent.name;
      const manifestPath = path.join(snapsBase, snapshotId, 'manifest.json');
      if (!(await pathExists(manifestPath))) {
        missingManifests.push({ snapshotId });
        continue;
      }

      let manifest;
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        manifest = JSON.parse(raw);
      } catch (err) {
        invalidManifests.push({ snapshotId, error: String(err?.message || err) });
        continue;
      }

      manifestsOk++;
      const entriesSha = Object.entries(manifest?.sha256 || {});
      for (const [rel, expected] of entriesSha) {
        if (typeof expected !== 'string' || expected.length < 16) continue;
        const hash = expected;
        const objPath = path.join(objsBase, hash.slice(0, 2), hash);
        const exists = await pathExists(objPath);
        if (!exists) {
          missingObjects++;
          missing.push({ snapshotId, rel, hash });
          continue;
        }
        if (verifyHash) {
          try {
            const got = await sha256File(objPath);
            if (got !== hash) {
              corruptObjects++;
              corrupt.push({ snapshotId, rel, hash, got });
            }
          } catch (err) {
            corruptObjects++;
            corrupt.push({ snapshotId, rel, hash, error: String(err?.message || err) });
          }
        }
      }
    }
  }

  const ok = invalidManifests.length === 0 && missingObjects === 0 && corruptObjects === 0;

  const report = {
    ok,
    verifyHash,
    snapshotsChecked,
    manifestsOk,
    missingObjects,
    corruptObjects,
    invalidManifests,
    missingManifests,
    missing,
    corrupt
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const lines = [];
    lines.push(`fsck: snapshotsChecked=${snapshotsChecked} manifestsOk=${manifestsOk}`);
    lines.push(`missingObjects=${missingObjects} corruptObjects=${corruptObjects} verifyHash=${verifyHash}`);
    if (invalidManifests.length > 0) lines.push(`invalidManifests=${invalidManifests.length}`);
    if (missingManifests.length > 0) lines.push(`missingManifests=${missingManifests.length}`);
    console.log(lines.join('\n'));
  }

  if (!ok) {
    const err = new UserError('fsck found integrity errors', {
      code: 'FSCK_ERRORS',
      exitCode: 7,
      hint: verifyHash ? 'Repair missing/corrupt objects and re-run fsck.' : 'Re-run with --verify-hash for full hash checking.'
    });
    err.report = report;
    throw err;
  }

  return report;
}
