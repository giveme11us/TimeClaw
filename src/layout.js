import path from 'node:path';
import { TIMECLAW_DIRNAME, TIMECLAW_MARKER } from './constants.js';

export function tcRoot(dest) {
  return path.join(dest, TIMECLAW_DIRNAME);
}

export function markerPath(dest) {
  return path.join(tcRoot(dest), TIMECLAW_MARKER);
}

export function machineRoot(dest, machineId) {
  return path.join(tcRoot(dest), 'machines', machineId);
}

export function snapshotsDir(dest, machineId) {
  return path.join(machineRoot(dest, machineId), 'snapshots');
}

export function stagingDir(dest, machineId) {
  return path.join(machineRoot(dest, machineId), 'staging');
}

export function latestPointerPath(dest, machineId) {
  return path.join(machineRoot(dest, machineId), 'latest.json');
}
