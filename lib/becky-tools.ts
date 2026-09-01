import type { SupabaseClient } from '@supabase/supabase-js';
import { THAMES_LOCKS } from './thames-locks';

// Function tools offered to Ask Becky. The database tools read through the
// caller's own Supabase client, so row-level security decides what the model
// can see; the journey planner does the arithmetic in code so the model never
// has to add table rows itself.
export const BECKY_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    name: 'list_places',
    description: 'List the family\'s saved places along the river (moorings, pubs, cafés, shops, fuel and other useful stops) with their notes and coordinates. Use this for any question about places, moorings or where to stop.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['mooring', 'pub', 'cafe', 'shop', 'fuel', 'other'], description: 'Only return places in this category. Omit for all places.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'list_guides',
    description: 'List the family-written guides (title, slug and summary). Use read_guide with a slug to read one in full.',
    strict: false,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function' as const,
    name: 'read_guide',
    description: 'Read the full text of one family guide by its slug (from list_guides).',
    strict: false,
    parameters: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'The guide slug from list_guides.' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'plan_thames_journey',
    description: 'Compute distance, cruising time and lock count between two points on the non-tidal Thames (Cricklade Bridge to Teddington), from Environment Agency data at the 8 km/h limit. ALWAYS use this for journey distances and timings instead of adding table rows yourself.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start lock or landmark, e.g. "Benson Lock".' },
        to: { type: 'string', description: 'End lock or landmark, e.g. "Goring Lock".' },
        minutes_per_lock: { type: 'number', description: 'Allowance per lock passed. Defaults to the family rule of thumb of 15 minutes.' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
];

function normalise(name: string) {
  return name.toLowerCase().replace(/[’']/g, '').replace(/\block\b/g, '').replace(/\s+/g, ' ').trim();
}

function findLockIndex(name: string): number | { candidates: string[] } {
  const wanted = normalise(name);
  if (!wanted) return { candidates: [] };
  const exact = THAMES_LOCKS.findIndex(lock => normalise(lock.name) === wanted);
  if (exact !== -1) return exact;
  const matches = THAMES_LOCKS
    .map((lock, index) => ({ lock, index }))
    .filter(({ lock }) => normalise(lock.name).includes(wanted) || wanted.includes(normalise(lock.name)));
  if (matches.length === 1) return matches[0].index;
  return { candidates: matches.map(({ lock }) => lock.name) };
}

function planJourney(args: { from?: unknown; to?: unknown; minutes_per_lock?: unknown }) {
  const fromResult = findLockIndex(String(args.from ?? ''));
  const toResult = findLockIndex(String(args.to ?? ''));
  for (const [label, result] of [['from', fromResult], ['to', toResult]] as const) {
    if (typeof result !== 'number') {
      return {
        error: `Could not identify the "${label}" point on the Cricklade–Teddington lock list.`,
        ...(result.candidates.length ? { did_you_mean: result.candidates } : { known_points: THAMES_LOCKS.map(lock => lock.name) }),
      };
    }
  }
  const from = fromResult as number, to = toResult as number;
  if (from === to) return { error: 'Start and end are the same place.' };
  const [upper, lower] = from < to ? [from, to] : [to, from];
  const minutesPerLock = Number(args.minutes_per_lock) > 0 ? Number(args.minutes_per_lock) : 15;

  const legs = [];
  let km = 0, cruisingMinutes = 0;
  for (let i = upper; i < lower; i++) {
    legs.push({ from: THAMES_LOCKS[i].name, to: THAMES_LOCKS[i + 1].name, km: THAMES_LOCKS[i].kmToNext, cruising_minutes: THAMES_LOCKS[i].minutesToNext });
    km += THAMES_LOCKS[i].kmToNext;
    cruisingMinutes += THAMES_LOCKS[i].minutesToNext;
  }
  const locksBetween = THAMES_LOCKS.slice(upper + 1, lower).filter(lock => lock.name.includes('Lock')).map(lock => lock.name);
  const lockAllowance = locksBetween.length * minutesPerLock;
  return {
    from: THAMES_LOCKS[from].name,
    to: THAMES_LOCKS[to].name,
    direction: from < to ? 'downstream' : 'upstream',
    distance_km: Math.round(km * 100) / 100,
    distance_miles: Math.round(km * 0.621371 * 100) / 100,
    cruising_minutes: cruisingMinutes,
    locks_passed_between: locksBetween,
    minutes_per_lock: minutesPerLock,
    lock_allowance_minutes: lockAllowance,
    total_minutes: cruisingMinutes + lockAllowance,
    notes: `Cruising time assumes the 8 km/h limit and excludes the start and end locks themselves; add about ${minutesPerLock} minutes for each of those you also pass through. Upstream progress can be slower when the stream is running.`,
    legs,
  };
}

export async function runBeckyTool(name: string, args: Record<string, unknown>, supabase: SupabaseClient): Promise<string> {
  if (name === 'plan_thames_journey') return JSON.stringify(planJourney(args));
  if (name === 'list_places') {
    let query = supabase.from('places').select('name,category,notes,latitude,longitude,google_maps_url').eq('is_published', true).order('name');
    if (typeof args.category === 'string' && args.category) query = query.eq('category', args.category);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return JSON.stringify({ places: data ?? [] });
  }
  if (name === 'list_guides') {
    const { data, error } = await supabase.from('guides').select('title,slug,summary').eq('is_published', true).order('title');
    if (error) throw new Error(error.message);
    return JSON.stringify({ guides: data ?? [] });
  }
  if (name === 'read_guide') {
    const { data, error } = await supabase.from('guides').select('title,summary,body').eq('slug', String(args.slug ?? '')).eq('is_published', true).maybeSingle();
    if (error) throw new Error(error.message);
    return JSON.stringify(data ?? { error: 'No published guide with that slug.' });
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}
