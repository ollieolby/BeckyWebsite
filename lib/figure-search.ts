// Ranking for find_figure, kept separate from the database call so it can be
// exercised directly against the figure manifests in scripts/ingest.
//
// There are only a few dozen figures, so they are ranked in code rather than
// in Postgres. The useful signal lives in the hand-written keywords ("weed
// hatch", "prop", "stuffing box"): the manual's photographs have no captions,
// so nothing but those keywords connects a reader's words to a picture.

export type RankableFigure = {
  label: string;
  caption: string;
  section: string;
  keywords: string[];
  // Tie-break between equally good matches, lowest first. The family's own
  // instruction manual outranks the sales spec and the drawings, so "where is
  // the inverter" returns the photograph of it rather than a schematic that
  // merely has the word on it.
  priority?: number;
};

// Grammatical filler. Always dropped; it never distinguishes one figure.
const FILLER = new Set([
  'the', 'a', 'an', 'of', 'on', 'in', 'to', 'for', 'and', 'or', 'is', 'are',
  'was', 'it', 'its', 'me', 'my', 'we', 'our', 'i', 'you', 'your', 'do', 'does',
  'did', 'be', 'am', 'if', 'so', 'as', 'at', 'by', 'up', 'out', 'that', 'this',
  'there', 'with', 'from', 'have', 'has', 'need', 'want', 'please', 'can',
  'could', 'would', 'should', 'when', 'then', 'than', 'about', 'again',
]);

// Words that describe the request rather than the subject. Dropped only when
// something else survives: "what does Becky look like" is all request words,
// and stripping them unconditionally left no query at all.
const REQUEST_WORDS = new Set([
  'show', 'see', 'look', 'looks', 'like', 'picture', 'photo', 'photograph',
  'image', 'diagram', 'figure', 'where', 'what', 'which', 'how', 'send',
  'find', 'get', 'got', 'becky', 'boat', 'her', 'his', 'their',
]);

export function figureTerms(query: string): string[] {
  // Two characters is the floor, not three: "BW" is the name of the key that
  // opens every lock and water point on the river.
  const words = query.toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(term => term.length >= 2 && !FILLER.has(term));
  const specific = words.filter(term => !REQUEST_WORDS.has(term));
  return specific.length ? specific : words;
}

export function scoreFigure(figure: RankableFigure, terms: string[]): number {
  const keywords = figure.keywords.map(word => word.toLowerCase());
  const label = figure.label.toLowerCase();
  const section = figure.section.toLowerCase();
  const caption = figure.caption.toLowerCase();
  let score = 0;
  for (const term of terms) {
    // An exact keyword hit is the strongest signal: the keywords are the words
    // a family member would actually type for this fitting.
    if (keywords.includes(term)) score += 5;
    else if (keywords.some(word => word.includes(term))) score += 3;
    if (label.includes(term)) score += 3;
    if (section.includes(term)) score += 2;
    if (caption.includes(term)) score += 1;
  }
  return score;
}

export function rankFigures<T extends RankableFigure>(figures: T[], query: string, limit = 4): T[] {
  const terms = figureTerms(query);
  if (!terms.length) return [];
  return figures
    .map(figure => ({ figure, score: scoreFigure(figure, terms) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || (a.figure.priority ?? 0) - (b.figure.priority ?? 0))
    .slice(0, limit)
    .map(entry => entry.figure);
}
