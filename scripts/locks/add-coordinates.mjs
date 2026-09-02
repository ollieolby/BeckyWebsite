// Adds Environment Agency coordinates to lib/thames-locks.ts.
//
//   node scripts/locks/add-coordinates.mjs
//
// The lock list came from EA distance guidance and had no positions, and a
// lock plotted from memory in the wrong place on a navigation map is worse
// than no lock at all. These come from the EA's own station register, the
// same source the site already uses for river levels, and are written into
// the file so the site never depends on that API at runtime.
import { readFileSync, writeFileSync } from 'node:fs';

const API = 'https://environment.data.gov.uk/flood-monitoring/id/stations';

// Entries whose lock name does not match its EA station label.
const ALIASES = {
  'Cricklade Bridge': 'Cricklade',
  'Sandford Lock': 'Sandford-on-Thames',
  'Bell Weir Lock': 'Bell Weir',
  'Penton Hook Lock': 'Penton Hook',
  'Teddington Lock (to Teddington Boundary Obelisk)': 'Teddington Lock',
};

const normalise = (value) => value
  .normalize('NFKD').replace(/[’']/g, '').toLowerCase()
  .replace(/[^a-z ]/g, ' ').replace(/\block\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

const source = readFileSync('lib/thames-locks.ts', 'utf8');
const names = [...source.matchAll(/\{ name: '([^']+)'/g)].map(m => m[1]);

const found = new Map();
for (const term of ['Lock', 'Weir', 'Thames', ...Object.values(ALIASES)]) {
  const response = await fetch(`${API}?search=${encodeURIComponent(term)}&_limit=500`);
  const { items = [] } = await response.json();
  for (const station of items) {
    if (station.riverName !== 'River Thames' || !station.lat || !station.long) continue;
    const label = Array.isArray(station.label) ? station.label[0] : station.label;
    if (!label) continue;
    const key = normalise(label);
    if (!found.has(key)) found.set(key, { lat: station.lat, lng: station.long, station: label });
  }
}

let updated = source;
const missing = [];
for (const name of names) {
  const match = found.get(normalise(ALIASES[name] ?? name));
  if (!match) { missing.push(name); continue; }
  const lat = Number(match.lat.toFixed(6));
  const lng = Number(match.lng.toFixed(6));
  // Plain string replace: lock names contain apostrophes and brackets, and
  // escaping them into a RegExp is how Teddington silently got skipped.
  const anchor = `{ name: '${name}',`;
  if (!updated.includes(anchor)) { missing.push(`${name} (anchor not found)`); continue; }
  updated = updated.replace(anchor, `${anchor} lat: ${lat}, lng: ${lng},`);
}

if (missing.length) {
  console.error(`No Environment Agency station for: ${missing.join(', ')}`);
  process.exit(1);
}
writeFileSync('lib/thames-locks.ts', updated);
console.log(`Added coordinates to ${names.length} entries.`);
