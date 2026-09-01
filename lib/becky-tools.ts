import type { SupabaseClient } from '@supabase/supabase-js';
import { THAMES_LOCKS } from './thames-locks';
import { fetchRiverLevel, fetchRiverConditions } from './river-data';

// Where the boats live: on the Marlow–Cookham reach near Bourne End.
// kmBelowMarlow is approximate — adjust it when the exact mooring is measured.
export const HOME_MOORING = {
  label: 'Home mooring (near Bourne End, between Marlow Lock and Cookham Lock)',
  upstreamLock: 'Marlow Lock',
  downstreamLock: 'Cookham Lock',
  kmBelowMarlow: 3.2,
};

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
    description: 'Compute distance, cruising time and locks passed between two points on the non-tidal Thames (Cricklade Bridge to Teddington), from Environment Agency data at the 8 km/h limit. Accepts lock names or "home" for the family\'s own mooring (between Marlow and Cookham locks). ALWAYS use this for journey distances and timings instead of adding table rows yourself.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start point: a lock name (e.g. "Benson Lock") or "home" for the family mooring.' },
        to: { type: 'string', description: 'End point: a lock name or "home".' },
        minutes_per_lock: { type: 'number', description: 'Allowance per lock passed. Defaults to the family rule of thumb of 15 minutes.' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'list_problems',
    description: 'List the family troubleshooting log: problems that happened aboard and how they were solved. ALWAYS check this when helping diagnose a fault — the same thing may have happened before.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'solved'], description: 'Only problems with this status. Omit for all.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'log_problem',
    description: 'Record a new problem in the family troubleshooting log. Confirm the wording with the user before calling. Requires editor access.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short name for the problem, e.g. "Webasto heater cutting out".' },
        problem: { type: 'string', description: 'What happened, symptoms, and anything already tried.' },
        asset_slug: { type: 'string', enum: ['becky', 'cormorant', 'drakar'], description: 'Which boat or the garden this concerns. Omit for general.' },
      },
      required: ['title', 'problem'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'solve_problem',
    description: 'Record the solution to a problem in the troubleshooting log and mark it solved. Confirm the wording with the user before calling. Requires editor access.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The problem id from list_problems.' },
        solution: { type: 'string', description: 'What fixed it, so the next person can repeat it.' },
      },
      required: ['id', 'solution'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'save_guide',
    description: 'Save a new family guide (published for the family and site visitors). Use when the user wants to write down knowledge, a checklist or instructions. Confirm the full text with the user before calling. Requires editor access.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string', description: 'One or two sentences on what the guide covers.' },
        body: { type: 'string', description: 'The full guide text, in Markdown.' },
        asset_slug: { type: 'string', enum: ['becky', 'cormorant', 'drakar'], description: 'Which boat or the garden this concerns. Omit for general.' },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
  },
  {
    type: 'function' as const,
    name: 'get_river_level',
    description: 'Get the live river level at the Cookham Lock gauge (the home reach), with the gauge\'s typical range. Reported every 15 minutes by the Environment Agency. Use for "how high is the river", "is the river up" and before-trip checks.',
    strict: false,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function' as const,
    name: 'get_river_conditions',
    description: 'Get the Environment Agency\'s current stream warnings ("red/yellow boards") for every reach of the non-tidal Thames, e.g. "Caution strong stream" or "No stream warnings". Use before recommending any journey. The home reach is Marlow Lock to Cookham Lock.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        near_home_only: { type: 'boolean', description: 'Return only the reaches around the home mooring (Temple–Marlow–Cookham–Boulter\'s). Defaults to false (all reaches).' },
      },
      additionalProperties: false,
    },
  },
];

function normalise(name: string) {
  return name.toLowerCase().replace(/[’']/g, '').replace(/\block\b/g, '').replace(/\s+/g, ' ').trim();
}

// Cumulative river position (km and cruising minutes) of each entry, measured
// downstream from Cricklade Bridge. A journey is then just the difference
// between two positions, and "home" is an ordinary position on the river.
const cumulativeKm: number[] = [0];
const cumulativeMinutes: number[] = [0];
for (const lock of THAMES_LOCKS) {
  cumulativeKm.push(cumulativeKm[cumulativeKm.length - 1] + lock.kmToNext);
  cumulativeMinutes.push(cumulativeMinutes[cumulativeMinutes.length - 1] + lock.minutesToNext);
}

type RiverPoint = { name: string; km: number; minutes: number };

function resolvePoint(raw: string): RiverPoint | { error: string; did_you_mean?: string[] } {
  const wanted = normalise(raw);
  if (!wanted) return { error: 'No place name given.' };
  if (/^(home|the )?(home|mooring|boat|becky|bourne end)( mooring)?$/.test(wanted) || wanted === 'our mooring') {
    const marlow = THAMES_LOCKS.findIndex(lock => lock.name === 'Marlow Lock');
    const reach = THAMES_LOCKS[marlow];
    const fraction = HOME_MOORING.kmBelowMarlow / reach.kmToNext;
    return {
      name: HOME_MOORING.label,
      km: cumulativeKm[marlow] + HOME_MOORING.kmBelowMarlow,
      minutes: cumulativeMinutes[marlow] + reach.minutesToNext * fraction,
    };
  }
  const exact = THAMES_LOCKS.findIndex(lock => normalise(lock.name) === wanted);
  if (exact !== -1) return { name: THAMES_LOCKS[exact].name, km: cumulativeKm[exact], minutes: cumulativeMinutes[exact] };
  const matches = THAMES_LOCKS
    .map((lock, index) => ({ lock, index }))
    .filter(({ lock }) => normalise(lock.name).includes(wanted) || wanted.includes(normalise(lock.name)));
  if (matches.length === 1) {
    const { lock, index } = matches[0];
    return { name: lock.name, km: cumulativeKm[index], minutes: cumulativeMinutes[index] };
  }
  return {
    error: `Could not identify "${raw}" on the Cricklade–Teddington lock list.`,
    did_you_mean: matches.length ? matches.map(({ lock }) => lock.name) : ['home', ...THAMES_LOCKS.map(lock => lock.name)],
  };
}

function planJourney(args: { from?: unknown; to?: unknown; minutes_per_lock?: unknown }) {
  const start = resolvePoint(String(args.from ?? ''));
  if ('error' in start) return { problem_with: 'from', ...start };
  const end = resolvePoint(String(args.to ?? ''));
  if ('error' in end) return { problem_with: 'to', ...end };
  if (start.name === end.name) return { error: 'Start and end are the same place.' };
  const minutesPerLock = Number(args.minutes_per_lock) > 0 ? Number(args.minutes_per_lock) : 15;
  const [upper, lower] = start.km < end.km ? [start, end] : [end, start];

  // Every lock whose position lies strictly between the endpoints is passed
  // through. The end lock itself is where you stop, so it is not counted;
  // for a journey from home, the boundary lock (Marlow or Cookham) falls
  // strictly between and is counted automatically.
  const between = THAMES_LOCKS
    .map((lock, index) => ({ name: lock.name, km: cumulativeKm[index], minutes: cumulativeMinutes[index] }))
    .filter(point => point.km > upper.km && point.km < lower.km && point.name.includes('Lock'));

  const waypoints = [upper, ...between, lower];
  const legs = waypoints.slice(0, -1).map((point, i) => ({
    from: point.name,
    to: waypoints[i + 1].name,
    km: Math.round((waypoints[i + 1].km - point.km) * 100) / 100,
    cruising_minutes: Math.round(waypoints[i + 1].minutes - point.minutes),
  }));
  const km = lower.km - upper.km;
  const cruisingMinutes = Math.round(lower.minutes - upper.minutes);
  const lockAllowance = between.length * minutesPerLock;
  return {
    from: start.name,
    to: end.name,
    direction: start.km < end.km ? 'downstream' : 'upstream',
    distance_km: Math.round(km * 100) / 100,
    distance_miles: Math.round(km * 0.621371 * 100) / 100,
    cruising_minutes: cruisingMinutes,
    locks_passed: between.map(point => point.name),
    minutes_per_lock: minutesPerLock,
    lock_allowance_minutes: lockAllowance,
    total_minutes: cruisingMinutes + lockAllowance,
    notes: `Cruising time assumes the 8 km/h limit. The destination lock itself is not counted; add about ${minutesPerLock} minutes if you pass through it too. Upstream progress can be slower when the stream is running — check get_river_conditions.`,
    legs,
  };
}

async function assetIdFromSlug(supabase: SupabaseClient, slug: unknown): Promise<string | null> {
  if (typeof slug !== 'string' || !slug) return null;
  const { data } = await supabase.from('assets').select('id').eq('slug', slug).maybeSingle();
  return data?.id ?? null;
}

export async function runBeckyTool(name: string, args: Record<string, unknown>, supabase: SupabaseClient, userId: string): Promise<string> {
  if (name === 'plan_thames_journey') return JSON.stringify(planJourney(args));
  if (name === 'list_problems') {
    let query = supabase.from('troubleshooting').select('id,title,problem,solution,status,created_at,updated_at,assets(name)').order('updated_at', { ascending: false }).limit(50);
    if (args.status === 'open' || args.status === 'solved') query = query.eq('status', args.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return JSON.stringify({ problems: data ?? [] });
  }
  if (name === 'log_problem') {
    const title = String(args.title ?? '').trim(), problem = String(args.problem ?? '').trim();
    if (!title || !problem) return JSON.stringify({ error: 'A title and a problem description are required.' });
    const { data, error } = await supabase.from('troubleshooting').insert({
      title, problem, asset_id: await assetIdFromSlug(supabase, args.asset_slug), created_by: userId,
    }).select('id,title,status').single();
    if (error) return JSON.stringify({ error: `Could not log it (${error.message}). The user may need editor access.` });
    return JSON.stringify({ logged: data });
  }
  if (name === 'solve_problem') {
    const solution = String(args.solution ?? '').trim();
    if (!solution) return JSON.stringify({ error: 'A solution description is required.' });
    const { data, error } = await supabase.from('troubleshooting')
      .update({ solution, status: 'solved', updated_at: new Date().toISOString() })
      .eq('id', String(args.id ?? '')).select('id,title,status').maybeSingle();
    if (error) return JSON.stringify({ error: `Could not save the solution (${error.message}). The user may need editor access.` });
    return JSON.stringify(data ? { solved: data } : { error: 'No problem with that id.' });
  }
  if (name === 'save_guide') {
    const title = String(args.title ?? '').trim(), body = String(args.body ?? '').trim();
    if (!title || !body) return JSON.stringify({ error: 'A title and the guide text are required.' });
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)}-${Date.now().toString(36)}`;
    const { data, error } = await supabase.from('guides').insert({
      title, slug, summary: String(args.summary ?? '').trim(), body,
      asset_id: await assetIdFromSlug(supabase, args.asset_slug), is_published: true, created_by: userId,
    }).select('id,title,slug').single();
    if (error) return JSON.stringify({ error: `Could not save the guide (${error.message}). The user may need editor access.` });
    return JSON.stringify({ saved: data, note: 'Published. It can be edited or unpublished in the family area.' });
  }
  if (name === 'get_river_level') return JSON.stringify(await fetchRiverLevel());
  if (name === 'get_river_conditions') {
    const conditions = await fetchRiverConditions();
    const wanted = args.near_home_only === true
      ? conditions.filter(({ reach }) => /Marlow|Cookham|Temple|Boulter/i.test(reach))
      : conditions;
    return JSON.stringify({ home_reach: 'Marlow Lock to Cookham Lock', conditions: wanted });
  }
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
