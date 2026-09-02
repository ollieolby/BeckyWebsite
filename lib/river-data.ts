// Live river data for the home reach, from Environment Agency open data.
// Station 2601TH is the Cookham Lock gauge (check-for-flooding station 7162).
// Fetches are cached for 15 minutes — the gauge itself reports every 15.

const STATION_ID = '2601TH';
const STATION_NAME = 'Cookham Lock';
export const CONDITIONS_URL = 'https://www.gov.uk/guidance/river-thames-current-river-conditions';

export type RiverLevel = {
  station: string;
  read_at: string;
  upstream_level_m: number | null;
  downstream_level_m: number | null;
  typical_range_low_m: number | null;
  typical_range_high_m: number | null;
  assessment: string;
  source: string;
};

export async function fetchRiverLevel(): Promise<RiverLevel> {
  const base = `https://environment.data.gov.uk/flood-monitoring/id/stations/${STATION_ID}`;
  const [readings, scale] = await Promise.all([
    fetch(`${base}/readings?latest`, { next: { revalidate: 900 } }).then(r => r.json()),
    fetch(`${base}/stageScale`, { next: { revalidate: 86400 } }).then(r => r.json()).catch(() => null),
  ]);
  let upstream: number | null = null, downstream: number | null = null, readAt = '';
  for (const item of readings.items ?? []) {
    const measure = String(item.measure ?? '');
    if (!measure.endsWith('-mASD')) continue;
    if (measure.includes('-level-stage-')) { upstream = item.value; readAt = item.dateTime; }
    if (measure.includes('-level-downstage-')) downstream = item.value;
  }
  const low = scale?.items?.typicalRangeLow ?? null;
  const high = scale?.items?.typicalRangeHigh ?? null;
  let assessment = 'Typical range for this gauge is unknown.';
  if (upstream !== null && low !== null && high !== null) {
    assessment = upstream > high
      ? `Above the typical range (${low}–${high} m) — expect a stronger stream and check conditions before boating.`
      : upstream < low
        ? `Below the typical range (${low}–${high} m).`
        : `Within the typical range (${low}–${high} m).`;
  }
  return {
    station: STATION_NAME,
    read_at: readAt,
    upstream_level_m: upstream,
    downstream_level_m: downstream,
    typical_range_low_m: low,
    typical_range_high_m: high,
    assessment,
    source: 'Environment Agency flood-monitoring API (station 2601TH / check-for-flooding station 7162)',
  };
}

export type ReachCondition = { reach: string; conditions: string };

export async function fetchRiverConditions(): Promise<ReachCondition[]> {
  const html = await fetch(CONDITIONS_URL, { next: { revalidate: 900 } }).then(r => r.text());
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const conditions: ReachCondition[] = [];
  for (const row of rows) {
    const cells = (row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) ?? [])
      .map(cell => cell.replace(/<[^>]+>/g, ' ').replace(/&#39;|&rsquo;|’/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
    if (cells.length === 2 && cells[0] && cells[0] !== 'Reach') conditions.push({ reach: cells[0], conditions: cells[1] });
  }
  return conditions;
}

// The reaches that matter for leaving or returning to the home mooring.
export function nearHome(conditions: ReachCondition[]): ReachCondition[] {
  return conditions.filter(({ reach }) => /Marlow|Cookham|Temple|Boulter/i.test(reach));
}

// The Environment Agency puts a coloured board out at each lock. Red means do
// not go; yellow means the stream is changing and to think twice; green means
// nothing is flagged. The wording is theirs, so it is matched rather than
// guessed at, and anything unrecognised counts as a warning rather than being
// quietly treated as fine.
export type Board = 'green' | 'amber' | 'red';

export function boardFor(conditions: ReachCondition[]): Board {
  let board: Board = 'green';
  for (const { conditions: text } of conditions) {
    if (/strong stream/i.test(text)) return 'red';
    if (/no stream warnings/i.test(text)) continue;
    board = 'amber';
  }
  return board;
}

export const BOARD_WORDS: Record<Board, string> = {
  green: 'No stream warnings',
  amber: 'Caution — stream changing',
  red: 'Caution — strong stream',
};
