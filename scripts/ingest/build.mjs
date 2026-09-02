// Turn each source document into (a) a Markdown rendition for the vector store
// and (b) a list of figures to upload.
//
// The rendition carries every figure's label and caption inline, at the point
// in the text where the figure actually sits. That is the whole trick: when
// file_search returns the "Starting her engines" passage, the model reads
// "[Figure becky-manual-fig-05: Main engine start panel ...]" in the retrieved
// text and can ask for that exact figure by slug. Without it the model knows a
// picture exists but has no way to name the right one.
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  unzip, readDocxParagraphs, readDocText, readPdfText,
  pdfPageCount, renderPdfPage, shrink, imageSize, slimDocx,
} from './extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pdf: 'application/pdf',
};

export function loadManifest() {
  const manifest = JSON.parse(readFileSync(join(HERE, 'documents.json'), 'utf8'));
  for (const doc of manifest.documents) {
    doc.figureSpecs = doc.figures
      ? JSON.parse(readFileSync(join(HERE, doc.figures), 'utf8'))
      : [];
  }
  return manifest;
}

const pad = n => String(n).padStart(2, '0');
export const figureSlug = (docKey, n) => `${docKey}-fig-${pad(n)}`;

function figureBlock(docKey, spec) {
  const slug = figureSlug(docKey, spec.figure_no);
  const bits = [`[Figure ${slug} - ${spec.label}: ${spec.caption}`];
  if (spec.keywords?.length) bits.push(` Also called: ${spec.keywords.join(', ')}.`);
  if (spec.notes) bits.push(` Note: ${spec.notes}`);
  if (spec.is_published === false) bits.push(' THIS FIGURE IS WITHHELD and must not be shown or described as current.');
  else bits.push(` Send it to the reader with find_figure slug "${slug}".`);
  return bits.join('') + ']';
}

// --- Word -------------------------------------------------------------------

function buildDocx(doc, sourceFile, workDir) {
  const dir = unzip(sourceFile, join(workDir, doc.key));
  const paragraphs = readDocxParagraphs(dir);
  const byMedia = new Map(doc.figureSpecs.filter(f => f.media).map(f => [f.media, f]));

  const lines = [];
  let seen = 0;
  const used = new Set();
  for (const p of paragraphs) {
    if (p.text) lines.push(p.bold && p.text.length < 60 ? `\n## ${p.text}\n` : p.text);
    for (const media of p.images) {
      seen += 1;
      const spec = byMedia.get(media);
      if (!spec) continue;            // logos and other page furniture
      used.add(spec.figure_no);
      lines.push(figureBlock(doc.key, spec));
    }
  }
  const missing = doc.figureSpecs.filter(f => f.media && !used.has(f.figure_no));
  return {
    markdown: lines.join('\n'),
    imagesSeen: seen,
    figures: doc.figureSpecs.map(spec => ({
      ...spec,
      sourcePath: spec.media ? join(dir, spec.media) : null,
    })),
    warnings: missing.map(f => `figure ${f.figure_no} (${f.media}) not found in ${doc.file}`),
  };
}

function buildDoc(doc, sourceFile) {
  return {
    markdown: readDocText(sourceFile),
    imagesSeen: 0,
    figures: [],
    warnings: [],
  };
}

// --- PDF --------------------------------------------------------------------

function buildPdf(doc, sourceFile, workDir) {
  const pages = pdfPageCount(sourceFile);
  const text = readPdfText(sourceFile);
  const dir = join(workDir, doc.key);
  mkdirSync(dir, { recursive: true });

  const lines = [];
  const warnings = [];
  const byPage = new Map(doc.figureSpecs.filter(f => f.pdf_page).map(f => [f.pdf_page, f]));

  if (text.trim().length < 200 && doc.figureSpecs.length) {
    // A scan. There is no text to index, so the rendition IS the figure list -
    // otherwise this document is invisible to every text search.
    lines.push(`This document is a scan with no machine-readable text. It is ${pages} sheet(s); each is described below.`);
  } else {
    lines.push(text);
  }
  for (let page = 1; page <= pages; page++) {
    const spec = byPage.get(page);
    if (spec) lines.push(`\n## Sheet ${page} - ${spec.label}\n`, figureBlock(doc.key, spec));
    else if (text.trim().length < 200) warnings.push(`${doc.file} page ${page} has no figure entry in the manifest`);
  }

  const figures = doc.figureSpecs.map(spec => ({
    ...spec,
    sourcePath: spec.pdf_page ? renderPdfPage(sourceFile, spec.pdf_page, join(dir, 'page')) : null,
  }));
  return { markdown: lines.join('\n'), imagesSeen: pages, figures, warnings };
}

// --- Public -----------------------------------------------------------------

export function buildDocument(doc, sourceDir, workDir) {
  const sourceFile = join(sourceDir, doc.file);
  const built = doc.kind === 'docx' ? buildDocx(doc, sourceFile, workDir)
    : doc.kind === 'doc' ? buildDoc(doc, sourceFile)
    : buildPdf(doc, sourceFile, workDir);

  const header = [
    `# ${doc.title}`,
    '',
    `Source file: ${doc.file}`,
    `Applies to: ${doc.asset}`,
    '',
    `About this document: ${doc.notes}`,
    '',
    '---',
    '',
  ].join('\n');

  const outDir = join(workDir, 'out');
  mkdirSync(outDir, { recursive: true });

  const figures = [];
  for (const spec of built.figures) {
    // A figure the extractor cannot produce can be supplied by hand: drop an
    // image named after its slug in scripts/ingest/media and it wins. That is
    // the escape hatch for the spec's layout drawing, which Word stores as an
    // EMF that nothing here can rasterise.
    const override = ['png', 'jpg', 'jpeg']
      .map(ext => join(HERE, 'media', `${figureSlug(doc.key, spec.figure_no)}.${ext}`))
      .find(existsSync);
    if (override) {
      spec.sourcePath = override;
      spec.skip = null;
      spec.format = override.endsWith('.png') ? 'png' : spec.format;
    }
    if (spec.skip) {
      built.warnings.push(`figure ${spec.figure_no} of ${doc.file} skipped (${spec.skip}): ${spec.label}`);
      continue;
    }
    if (!spec.sourcePath) {
      built.warnings.push(`figure ${spec.figure_no} of ${doc.file} has no source image`);
      continue;
    }
    const slug = figureSlug(doc.key, spec.figure_no);
    // Line drawings keep their flat colour; photographs become JPEG.
    const isDrawing = spec.format === 'png';
    const out = join(outDir, `${slug}.${isDrawing ? 'png' : 'jpg'}`);
    shrink(spec.sourcePath, out, { format: isDrawing ? 'png' : 'jpeg' });
    figures.push({
      figure_no: spec.figure_no,
      slug,
      label: spec.label,
      caption: spec.caption ?? '',
      section: spec.section ?? '',
      keywords: spec.keywords ?? [],
      is_published: spec.is_published !== false,
      priority: doc.figure_priority ?? 0,
      notes: spec.notes ?? '',
      localPath: out,
      storagePath: `${doc.key}/${slug}${extname(out)}`,
      mime_type: isDrawing ? 'image/png' : 'image/jpeg',
      ...imageSize(out),
    });
  }

  // Slimming happens after the figures are extracted, so the figures still
  // come from the untouched original.
  const uploadFile = doc.slim && doc.kind === 'docx'
    ? slimDocx(sourceFile, join(workDir, doc.key + '-slim'))
    : sourceFile;

  return {
    ...doc,
    sourceFile,
    uploadFile,
    mime_type: MIME[doc.kind],
    markdown: header + built.markdown,
    imagesSeen: built.imagesSeen,
    figures,
    warnings: built.warnings,
  };
}
