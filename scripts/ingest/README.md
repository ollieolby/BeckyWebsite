# Document and figure ingest

Loads the family's source documents into Supabase and the OpenAI vector store,
with every photograph and diagram extracted, labelled and made retrievable.

```bash
npm run ingest:dry          # build everything locally, upload nothing
npm run ingest              # do it
npm run figures:test        # check questions still reach the right figures
node scripts/ingest/run.mjs --only becky-manual
```

Re-running is safe. A document is matched on its storage path, its figures are
replaced wholesale, and its previous OpenAI file is detached from the vector
store before the new one goes on.

## Why figures need hand-written labels

The instruction manual's 34 photographs have **no captions**. Each is anchored
only by the sentence before it — "it's controlled in the engine room here",
"they are switched on/off here". Nothing in the file says which switch is in
which photo, so nothing can be derived automatically:

- figures 1 and 8 are **the same photograph**, annotated differently. One
  circles the stern gland greaser (the anti-sinking procedure), the other the
  weed hatch cover. Filename or image similarity cannot tell them apart.
- sheet 3 of the electrical drawings is a **rejected** proposal, struck through
  with a red X. Retrieved as an image it looks exactly like a valid schematic.
- the BSS report's only images are logos.

So the labels live in `*.figures.json`, written by hand and checked in. That is
the part worth curating; everything else is mechanical.

## Correcting a label

Edit the relevant `*.figures.json`, then:

```bash
npm run figures:test
npm run ingest -- --only becky-manual
```

Fields per figure:

| field | meaning |
|---|---|
| `figure_no` | position in the source document, 1-based. Identity — do not renumber |
| `label` | what the reader sees, e.g. "Main engine start panel (Perkins Sabre)" |
| `caption` | one sentence on what is actually visible, including any arrow or circle |
| `keywords` | the words a family member would type. The main retrieval signal |
| `section` | heading it sat under in the source |
| `is_published` | `false` withholds it from retrieval but keeps it on record |
| `notes` | a caveat the reader must be told, e.g. "same photo as figure 1" |
| `format` | `"png"` for line drawings; photographs default to JPEG |
| `skip` | reason this figure cannot be extracted, with what to do instead |

`figure_priority` in `documents.json` breaks ties between equally good matches,
lowest first — the instruction manual outranks the sales spec, so "where is the
inverter" returns the photograph rather than a schematic with the word on it.

## What gets indexed

Not the original file. The ingest builds a Markdown rendition carrying every
figure's label and caption **inline, at the point the figure appears**:

```
[Figure becky-manual-fig-05 - Main engine start panel (Perkins Sabre): The black
Perkins Sabre instrument panel ... Send it to the reader with find_figure slug
"becky-manual-fig-05".]
```

That marker is what makes figure retrieval reliable. When `file_search` returns
the "Starting her engines" passage, the model reads the slug in the retrieved
text and asks for that exact figure, instead of knowing a picture exists
somewhere and guessing. It also rescues the electrical drawings, which are
scans with no text layer at all and would otherwise index as an empty file.

## Requirements

`unzip`, `pdftotext`, `pdfinfo`, `pdftoppm` (poppler) and `sips` (macOS). The
`.doc` conversion uses `textutil`, so the legacy Spade Oak notes need macOS.

Environment: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`OPENAI_API_KEY`, `OPENAI_VECTOR_STORE_ID`, and optionally `INGEST_USER_EMAIL`
to attribute the upload to a specific profile (defaults to the first admin).

## Known gap

`becky-spec-fig-02`, the "LAYOUT OF BECKY" general arrangement drawing, is a
6.5 MB Windows Enhanced Metafile and is not uploaded — no converter here reads
EMF. To include it: open the spec in Word, right-click the drawing, Save as
Picture as PNG, drop it at `scripts/ingest/media/becky-spec-fig-02.png`, remove
the `"skip"` field, and re-run.
