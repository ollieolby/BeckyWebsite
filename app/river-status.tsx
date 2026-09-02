import { fetchRiverLevel, fetchRiverConditions, nearHome, boardFor, BOARD_WORDS, CONDITIONS_URL } from '@/lib/river-data';

// The live board for the home reach, drawn as the flag it is on the river.
// It links to the Environment Agency page it came from, because the boards
// change through the day and the reader should be able to check the source.
export default async function RiverStatus() {
  let level, reaches;
  try {
    const [fetchedLevel, conditions] = await Promise.all([fetchRiverLevel(), fetchRiverConditions()]);
    level = fetchedLevel;
    reaches = nearHome(conditions);
  } catch {
    return null;
  }

  const board = boardFor(reaches);
  const warnings = reaches.filter(item => !/no stream warnings/i.test(item.conditions));
  const readAt = level.read_at
    ? new Date(level.read_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
    : '';

  return (
    <a
      className={`river-flag board-${board}`}
      href={CONDITIONS_URL}
      target="_blank"
      rel="noreferrer"
    >
      <svg className="river-flag-mark" viewBox="0 0 44 52" aria-hidden="true">
        <path d="M8 4v46" stroke="#123e47" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <path d="M9.5 5.5h28c-3 5-3 9.6 0 14.6h-28z" className="river-flag-cloth" />
      </svg>
      <span className="river-flag-text">
        <strong>{warnings.length ? warnings.map(item => item.conditions).join(' · ') : BOARD_WORDS[board]}</strong>
        <small>
          {level.station} {level.upstream_level_m != null ? `${level.upstream_level_m.toFixed(2)} m` : 'level unavailable'}
          {level.typical_range_low_m != null && level.typical_range_high_m != null && ` · typical ${level.typical_range_low_m}–${level.typical_range_high_m} m`}
          {readAt && ` · ${readAt}`}
        </small>
      </span>
      <span className="river-flag-go" aria-hidden="true">↗</span>
    </a>
  );
}
