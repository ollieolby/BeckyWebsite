import type { SupabaseClient } from '@supabase/supabase-js';
import { extractDocument, kindFromName, type RawFigure } from './extract.ts';
import { proposeCaption, fallbackCaption, type ProposedCaption } from './caption.ts';
import { renditionPathFor } from './paths.ts';

// Reading an uploaded document: pull out its figures, describe each one, and
// write the rendition that makes them findable.
//
// Shared by the family area's "Read for figures" button and by Ask Becky's
// process_document tool, so there is one code path however it was asked for.
// Work is done a batch at a time: a 34-figure manual is one extraction call
// followed by several captioning calls, each comfortably inside a function
// timeout, instead of one request that dies half way through.

export type ProcessResult = {
  done: boolean;
  figures: number;
  remaining: number;
  captioned: number;
  warnings: string[];
  stage: 'extracted' | 'captioning' | 'complete';
};

export class ProcessError extends Error {}

type DocumentRow = { id: string; title: string; storage_path: string; asset_id: string | null };

export async function processDocumentBatch(
  supabase: SupabaseClient,
  documentId: string,
  captionBatchSize = 6,
): Promise<ProcessResult> {
  const { data: document, error: readError } = await supabase
    .from('documents').select('id,title,storage_path,mime_type,asset_id').eq('id', documentId).single();
  if (readError || !document) throw new ProcessError('No document with that id.');

  const kind = kindFromName(document.storage_path);
  if (!kind) {
    const message = /\.doc$/i.test(document.storage_path)
      ? 'Old .doc files cannot be read here. Open it in Word, save it as .docx and upload that instead.'
      : 'That file type cannot be read. It needs to be a .docx, .pdf, .md or .txt.';
    await mark(supabase, documentId, 'failed', message);
    throw new ProcessError(message);
  }

  const { data: existing } = await supabase
    .from('document_figures').select('id,figure_no,slug,storage_path,section,caption_source,notes')
    .eq('document_id', documentId).order('figure_no');

  if (existing?.length) {
    const waiting = existing.filter(figure => figure.caption_source === 'pending');
    if (!waiting.length) {
      await finaliseRendition(supabase, document);
      await mark(supabase, documentId, 'done', '');
      return { done: true, figures: existing.length, remaining: 0, captioned: 0, warnings: [], stage: 'complete' };
    }
    const captioned = await captionBatch(supabase, document, waiting.slice(0, captionBatchSize));
    const remaining = waiting.length - captioned;
    if (!remaining) {
      await finaliseRendition(supabase, document);
      await mark(supabase, documentId, 'done', '');
    }
    return {
      done: remaining === 0, figures: existing.length, remaining, captioned,
      warnings: [], stage: remaining ? 'captioning' : 'complete',
    };
  }

  // Nothing extracted yet.
  await mark(supabase, documentId, 'processing', '');
  const { data: blob, error: downloadError } = await supabase.storage.from('manuals').download(document.storage_path);
  if (downloadError || !blob) throw new ProcessError('The file could not be read out of storage.');

  let extracted;
  try {
    extracted = await extractDocument(Buffer.from(await blob.arrayBuffer()), kind);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The file could not be read.';
    await mark(supabase, documentId, 'failed', message);
    throw new ProcessError(message);
  }

  const key = figureKey(document.title, documentId);
  for (const figure of extracted.figures) {
    const slug = `${key}-fig-${String(figure.index).padStart(2, '0')}`;
    const path = `${key}/${slug}.jpg`;
    const { error: uploadError } = await supabase.storage.from('figures')
      .upload(path, figure.image, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw new ProcessError(`Storing figure ${figure.index}: ${uploadError.message}`);
    const { error: rowError } = await supabase.from('document_figures').insert({
      document_id: documentId,
      asset_id: document.asset_id,
      figure_no: figure.index,
      slug,
      label: `Figure ${figure.index}`,
      caption: '',
      section: figure.section,
      keywords: [],
      storage_path: path,
      mime_type: 'image/jpeg',
      caption_source: 'pending',
      is_published: false,
      // Below the hand-written figures: a machine caption should never
      // outrank one a person wrote.
      priority: 5,
      // The surrounding text is parked here until the captioner needs it.
      notes: [
        figure.contextBefore && `Before: ${figure.contextBefore}`,
        figure.contextAfter && `After: ${figure.contextAfter}`,
      ].filter(Boolean).join('\n').slice(0, 2000),
    });
    if (rowError) throw new ProcessError(`Saving figure ${figure.index}: ${rowError.message}`);
  }

  await saveRendition(supabase, document, extracted.text);
  if (!extracted.figures.length) {
    await finaliseRendition(supabase, document);
    await mark(supabase, documentId, 'done', extracted.warnings.join(' '));
  } else {
    await mark(supabase, documentId, 'processing', extracted.warnings.join(' '));
  }

  return {
    done: extracted.figures.length === 0,
    figures: extracted.figures.length,
    remaining: extracted.figures.length,
    captioned: 0,
    warnings: extracted.warnings,
    stage: extracted.figures.length ? 'extracted' : 'complete',
  };
}

async function mark(supabase: SupabaseClient, id: string, status: string, message: string) {
  await supabase.from('documents').update({ process_status: status, process_message: message.slice(0, 1000) }).eq('id', id);
}

type PendingFigure = { id: string; figure_no: number; storage_path: string; section: string; notes: string };

async function captionBatch(supabase: SupabaseClient, document: DocumentRow, batch: PendingFigure[]) {
  let done = 0;
  for (const row of batch) {
    const { data: image } = await supabase.storage.from('figures').download(row.storage_path);
    if (!image) continue;
    const figure: RawFigure = {
      index: row.figure_no,
      image: Buffer.from(await image.arrayBuffer()),
      section: row.section,
      contextBefore: /Before: (.*)/.exec(row.notes ?? '')?.[1] ?? '',
      contextAfter: /After: (.*)/.exec(row.notes ?? '')?.[1] ?? '',
    };

    let proposed: ProposedCaption;
    try {
      proposed = await proposeCaption(figure, document.title);
    } catch (error) {
      proposed = fallbackCaption(figure, error instanceof Error ? error.message : 'unknown error');
    }

    await supabase.from('document_figures').update({
      label: proposed.label,
      caption: proposed.caption,
      keywords: proposed.keywords,
      uncertain: proposed.uncertain,
      caption_source: 'ai',
      // Still hidden. Approving it is a human act, in the family area.
      is_published: false,
      notes: '',
    }).eq('id', row.id);
    done += 1;
  }
  return done;
}

async function saveRendition(supabase: SupabaseClient, document: DocumentRow, text: string) {
  const header = `# ${document.title}\n\nSource file: ${document.storage_path.split('/').pop()}\n\n---\n\n`;
  await supabase.storage.from('manuals').upload(
    renditionPathFor(document.id), Buffer.from(header + text, 'utf8'),
    { contentType: 'text/markdown', upsert: true },
  );
}

// Put each figure's label and caption into the rendition where the figure
// actually sits, so a retrieved passage names the figure to show rather than
// the model only knowing a picture exists somewhere.
async function finaliseRendition(supabase: SupabaseClient, document: DocumentRow) {
  const { data: blob } = await supabase.storage.from('manuals').download(renditionPathFor(document.id));
  if (!blob) return;
  const { data: figures } = await supabase.from('document_figures')
    .select('figure_no,slug,label,caption,keywords,uncertain,is_published')
    .eq('document_id', document.id).order('figure_no');

  let body = await blob.text();
  for (const figure of figures ?? []) {
    const parts = [`[Figure ${figure.slug} - ${figure.label}: ${figure.caption}`];
    if (figure.keywords?.length) parts.push(` Also called: ${figure.keywords.join(', ')}.`);
    if (figure.uncertain) parts.push(` Unverified: ${figure.uncertain}`);
    parts.push(figure.is_published
      ? ` Send it to the reader with find_figure slug "${figure.slug}".`
      : ' THIS FIGURE IS AWAITING REVIEW and must not be shown.');
    body = body.replace(`[[FIGURE ${figure.figure_no}]]`, parts.join('') + ']');
  }
  body = body.replace(/\[\[FIGURE \d+\]\]/g, '');
  await supabase.storage.from('manuals').upload(
    renditionPathFor(document.id), Buffer.from(body, 'utf8'),
    { contentType: 'text/markdown', upsert: true },
  );
}

function figureKey(title: string, id: string) {
  const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${stem || 'document'}-${id.slice(0, 8)}`;
}
