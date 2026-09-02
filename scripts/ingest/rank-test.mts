// Checks that a plain-English question reaches the right figure.
//
//   node --experimental-strip-types scripts/ingest/rank-test.mts
//
// Runs the shipped ranking from lib/figure-search.ts against the figure
// manifests, so editing a label or a keyword list here is checked rather than
// hoped about. Every case is a question someone might actually ask aboard.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankFigures } from '../../lib/figure-search.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

type Spec = {
  figure_no: number; label: string; caption: string; section: string;
  keywords: string[]; is_published?: boolean; skip?: string;
};

const manifest = JSON.parse(readFileSync(join(HERE, 'documents.json'), 'utf8')) as {
  documents: { key: string; figures: string | null; figure_priority: number }[];
};

const figures = manifest.documents.flatMap(doc =>
  !doc.figures ? [] : (JSON.parse(readFileSync(join(HERE, doc.figures), 'utf8')) as Spec[])
    .filter(spec => spec.is_published !== false && !spec.skip)
    .map(spec => ({
      ...spec,
      priority: doc.figure_priority,
      slug: `${doc.key}-fig-${String(spec.figure_no).padStart(2, '0')}`,
    }))
);

// A "|" separated expectation means any of those figures is a right answer.
const CASES: [string, string][] = [
  ['how do I start the main engine', 'becky-manual-fig-05'],
  ['show me the weed hatch', 'becky-manual-fig-08'],
  ['water is dripping in the back bedroom, what do I do', 'becky-manual-fig-01'],
  ['where is the switch to start the generator', 'becky-manual-fig-14'],
  ['which button flushes the toilet', 'becky-manual-fig-19'],
  ['how do I turn the heating on', 'becky-manual-fig-15'],
  ['I want a quick boost of hot water', 'becky-manual-fig-16'],
  ['where do I fill up with drinking water', 'becky-manual-fig-23'],
  ['how do I empty the waste tank', 'becky-manual-fig-24|becky-manual-fig-25|becky-manual-fig-26'],
  ['where is the shower pump', 'becky-manual-fig-18'],
  ['switch off the freezer before we leave', 'becky-manual-fig-12'],
  ['where is the inverter', 'becky-manual-fig-13'],
  ['the engine is overheating', 'becky-manual-fig-02|becky-manual-fig-03'],
  ['show me the bow thruster control', 'becky-manual-fig-07'],
  ['how full is the water tank', 'becky-manual-fig-20'],
  ['where do I put the diesel in', 'becky-manual-fig-28'],
  ['what does the BW key look like', 'becky-manual-fig-31'],
  ['the boat is taking on water and the bilge pump has failed', 'becky-manual-fig-33'],
  ['how are the electrics wired up', 'becky-manual-fig-34'],
  ['show me the wiring diagram', 'becky-electrical-fig-01'],
  ['what does Becky look like', 'becky-spec-fig-01'],
  ['how do I clean the propeller', 'becky-manual-fig-08'],
  ['which fenders for mooring posts', 'becky-manual-fig-09'],
  ['where is the main fuse board', 'becky-manual-fig-10'],
  ['how do I put hot ashes out', 'becky-manual-fig-30'],
  ['is the rudder straight', 'becky-manual-fig-06'],
];

let hitsAtOne = 0;
let misses = 0;
console.log(`${figures.length} retrievable figures, ${CASES.length} questions\n`);
for (const [question, expected] of CASES) {
  const wanted = expected.split('|');
  const ranked = rankFigures(figures, question);
  const position = ranked.findIndex(figure => wanted.includes(figure.slug));
  if (position === 0) hitsAtOne += 1;
  if (position < 0) misses += 1;
  const mark = position === 0 ? '✓' : position > 0 ? '~' : '✗';
  console.log(`${mark} ${question}`);
  if (position !== 0) {
    console.log(`    want ${expected}\n    got  ${ranked.map(f => f.slug).join(', ') || '(nothing)'}`);
  }
}
console.log(`\ntop-1 ${hitsAtOne}/${CASES.length}, not found ${misses}`);

// A figure nobody can reach is a figure nobody will ever be sent.
const reachable = new Set(CASES.flatMap(([question]) => rankFigures(figures, question, 40).map(f => f.slug)));
const unreachable = figures.filter(f => !reachable.has(f.slug));
if (unreachable.length) console.log(`\nnot reached by any test question: ${unreachable.map(f => f.slug).join(', ')}`);

if (misses || hitsAtOne < CASES.length) {
  console.error('\nFAILED: every question should return its figure first.');
  process.exit(1);
}
console.log('\nPASS');
