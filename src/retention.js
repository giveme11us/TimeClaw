// Time Machine-like retention:
// - hourly backups for past 24h
// - daily backups for past 30d
// - weekly backups for older

export function classifySnapshots(snapshots, now = Date.now()) {
  // snapshots: [{id, tsMs}]
  const byTs = [...snapshots].sort((a, b) => a.tsMs - b.tsMs);
  const keep = new Set();

  // keep latest always
  if (byTs.length) keep.add(byTs[byTs.length - 1].id);

  // buckets
  const hourly = new Map();
  const daily = new Map();
  const weekly = new Map();

  for (const s of byTs) {
    const ageMs = now - s.tsMs;
    const hour = Math.floor(s.tsMs / 3_600_000);
    const day = Math.floor(s.tsMs / 86_400_000);
    const week = Math.floor(s.tsMs / 604_800_000);

    if (ageMs <= 24 * 3_600_000) {
      if (!hourly.has(hour)) hourly.set(hour, s);
    } else if (ageMs <= 30 * 86_400_000) {
      if (!daily.has(day)) daily.set(day, s);
    } else {
      if (!weekly.has(week)) weekly.set(week, s);
    }
  }

  for (const s of hourly.values()) keep.add(s.id);
  for (const s of daily.values()) keep.add(s.id);
  for (const s of weekly.values()) keep.add(s.id);

  return { keepIds: keep };
}
