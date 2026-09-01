import { fetchRiverLevel, fetchRiverConditions, nearHome } from '@/lib/river-data';

// Live strip for the home reach: gauge level at Cookham Lock and any stream
// warnings between Temple and Boulter's. Renders nothing if the EA is down.
export default async function RiverStatus() {
  let level, warnings;
  try {
    const [fetchedLevel, conditions] = await Promise.all([fetchRiverLevel(), fetchRiverConditions()]);
    level = fetchedLevel;
    warnings = nearHome(conditions).filter(item => !/no stream warnings/i.test(item.conditions));
  } catch {
    return null;
  }
  const readAt = level.read_at
    ? new Date(level.read_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
    : '';
  return (
      <div className={`river-status ${warnings.length ? 'river-warn' : 'river-ok'}`}>
        <span className="river-dot" aria-hidden="true" />
        <span>
          <strong>River at {level.station}:</strong>{' '}
          {level.upstream_level_m != null ? `${level.upstream_level_m.toFixed(2)} m` : 'level unavailable'}
          {level.typical_range_low_m != null && level.typical_range_high_m != null && ` (typical ${level.typical_range_low_m}–${level.typical_range_high_m} m)`}
          {readAt && ` · ${readAt}`}
        </span>
        <span>{warnings.length ? warnings.map(item => `${item.reach}: ${item.conditions}`).join(' · ') : 'No stream warnings near home'}</span>
      </div>
  );
}
