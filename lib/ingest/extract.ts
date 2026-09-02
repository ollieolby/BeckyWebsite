import { unzipSync, strFromU8 } from 'fflate';
import sharp from 'sharp';
import { createRequire } from 'node:module';

// Server-side extraction, so the family can upload a manual from the site and
// get labelled figures without anyone running a script on a Mac.
//
// This deliberately re-implements the scripts/ingest extractor rather than
// sharing it: that one shells out to unzip, poppler and sips, none of which
// exist on Vercel's runtime. Everything here is either pure JS or a native
// module with prebuilt Linux binaries.

export type RawFigure = {
  /** 1-based position in the document; the figure's stable identity. */
  index: number;
  image: Buffer;
  /** Heading the figure sits under, where the format has headings. */
  section: string;
  /** The sentence before it - for uncaptioned photos this is the only clue. */
  contextBefore: string;
  contextAfter: string;
  page?: number;
};

export type Extracted = {
  /** Plain text of the document, with [[FIGURE n]] where each figure sits. */
  text: string;
  figures: RawFigure[];
  warnings: string[];
};

export const SUPPORTED = ['docx', 'pdf', 'md', 'txt'] as const;

export function kindFromName(name: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'docx') return 'docx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'txt' || ext === 'text') return 'txt';
  return null;
}

const MAX_FIGURE_PX = 1600;
const FIGURE_QUALITY = 82;

async function toWebImage(input: Buffer, raw?: { width: number; height: number; channels: 1 | 3 | 4 }) {
  return sharp(input, raw ? { raw } : undefined)
    .resize({ width: MAX_FIGURE_PX, height: MAX_FIGURE_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: FIGURE_QUALITY })
    .toBuffer();
}

// --- Word ------------------------------------------------------------------

const decodeXml = (text: string) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&');

async function extractDocx(buffer: Buffer): Promise<Extracted> {
  const files = unzipSync(new Uint8Array(buffer));
  const documentXml = files['word/document.xml'];
  if (!documentXml) throw new Error('That .docx has no document.xml - it may be corrupt.');
  const xml = strFromU8(documentXml);

  const rels = new Map<string, string>();
  const relsFile = files['word/_rels/document.xml.rels'];
  if (relsFile) {
    for (const m of strFromU8(relsFile).matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
      rels.set(m[1], m[2].replace(/^\/?word\//, ''));
    }
  }

  // One pass over the paragraphs collects the body text with a placeholder
  // where each image sits, and the context each image needs to be captioned.
  const body: string[] = [];
  const found: { media: string; section: string; contextBefore: string; at: number }[] = [];
  let section = '';
  let previous = '';

  for (const chunk of xml.split(/<w:p[ >]/).slice(1)) {
    const block = '<w:p ' + chunk.split('</w:p>')[0];
    const text = [...block.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => decodeXml(m[1])).join('').trim();
    // A bold paragraph mark is how an author without heading styles marks a
    // heading, and the family's manual uses no heading styles at all.
    const bold = /<w:pPr>[\s\S]*?<w:rPr>[\s\S]*?<w:b\s*\/>/.test(block);
    const ids = [
      ...[...block.matchAll(/<a:blip[^>]*r:embed="([^"]+)"/g)].map(m => m[1]),
      ...[...block.matchAll(/<v:imagedata[^>]*r:id="([^"]+)"/g)].map(m => m[1]),
    ];

    if (text) {
      if (bold && text.length < 60) { section = text; body.push(`\n## ${text}\n`); }
      else body.push(text);
      previous = text;
    }
    for (const id of ids) {
      const target = rels.get(id);
      if (!target) continue;
      found.push({ media: target, section, contextBefore: previous, at: body.length });
      body.push(`[[FIGURE ${found.length}]]`);
    }
  }

  // The text after a figure is often what explains it, so fill it in now that
  // the whole body is known.
  const figures: RawFigure[] = [];
  const warnings: string[] = [];
  for (const [position, entry] of found.entries()) {
    const index = position + 1;
    const after = body.slice(entry.at + 1).find(line => line.trim() && !line.startsWith('[[FIGURE')) ?? '';

    if (/\.(emf|wmf)$/i.test(entry.media)) {
      warnings.push(`Figure ${index} is a Windows metafile (${entry.media.split('/').pop()}), which cannot be converted here. Save it out of Word as a PNG and add it by hand.`);
      continue;
    }
    const raw = files['word/' + entry.media];
    if (!raw) { warnings.push(`Figure ${index}: ${entry.media} is missing from the file.`); continue; }
    try {
      figures.push({
        index,
        image: await toWebImage(Buffer.from(raw)),
        section: entry.section,
        contextBefore: entry.contextBefore,
        contextAfter: after.trim().replace(/^##\s*/, ''),
      });
    } catch {
      warnings.push(`Figure ${index}: the embedded image could not be read.`);
    }
  }

  return { text: body.join('\n'), figures, warnings };
}

// --- PDF -------------------------------------------------------------------

async function loadPdfjs() {
  const require = createRequire(import.meta.url);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  return pdfjs;
}

// Pages are rendered rather than having their embedded images pulled out.
// Extracting the images loses anything drawn over them: the family's
// electrical drawings have a sheet struck through with a red X, and pulling
// the image out gives back a clean schematic with no sign it was rejected.
const PDF_RENDER_SCALE = 150 / 72;
const PDF_FIGURE_PAGE_LIMIT = 40;

async function extractPdf(buffer: Buffer): Promise<Extracted> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer), useWorkerFetch: false, useSystemFonts: false,
  }).promise;

  const warnings: string[] = [];
  const pageText: string[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    pageText.push(content.items.map(item => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim());
  }

  const totalChars = pageText.join('').length;
  const figures: RawFigure[] = [];

  // A PDF with text is a document whose pages are not figures. A PDF with
  // almost none is a scan, where each page IS the figure and rendering it is
  // the only way the content is available at all.
  const isScan = totalChars < 200 * doc.numPages / 4;
  if (isScan) {
    const { createCanvas } = (await import('@napi-rs/canvas'));
    const pages = Math.min(doc.numPages, PDF_FIGURE_PAGE_LIMIT);
    if (doc.numPages > pages) warnings.push(`only the first ${pages} of ${doc.numPages} pages were turned into figures`);
    for (let page = 1; page <= pages; page++) {
      try {
        const target = await doc.getPage(page);
        const viewport = target.getViewport({ scale: PDF_RENDER_SCALE });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await target.render({ canvasContext: context as any, viewport, canvas: canvas as any }).promise;
        figures.push({
          index: figures.length + 1,
          image: await toWebImage(canvas.toBuffer('image/png')),
          section: `Sheet ${page}`,
          contextBefore: pageText[page - 1] ?? '',
          contextAfter: '',
          page,
        });
      } catch (error) {
        warnings.push(`page ${page} could not be rendered (${error instanceof Error ? error.message : 'unknown'})`);
      }
    }
  }

  const text = isScan
    ? `This document is a scan with no machine-readable text. It is ${doc.numPages} sheet(s); each is described below.\n`
      + figures.map(figure => `\n## Sheet ${figure.page}\n[[FIGURE ${figure.index}]]`).join('\n')
    : pageText.map((body, i) => `\n## Page ${i + 1}\n${body}`).join('\n');

  if (!isScan && doc.numPages > 0) {
    warnings.push('PDF pages were indexed as text; only scanned PDFs are turned into figures.');
  }
  return { text, figures, warnings };
}

// --- Plain text ------------------------------------------------------------

function extractText(buffer: Buffer): Extracted {
  return { text: buffer.toString('utf8'), figures: [], warnings: [] };
}

// --- Public ----------------------------------------------------------------

export async function extractDocument(buffer: Buffer, kind: string): Promise<Extracted> {
  if (kind === 'docx') return extractDocx(buffer);
  if (kind === 'pdf') return extractPdf(buffer);
  if (kind === 'md' || kind === 'txt') return extractText(buffer);
  throw new Error(
    kind === 'doc'
      ? 'Old .doc files cannot be read here. Open it in Word and save it as .docx, then upload that.'
      : `${kind} files are not supported. Upload a .docx, .pdf, .md or .txt.`,
  );
}
