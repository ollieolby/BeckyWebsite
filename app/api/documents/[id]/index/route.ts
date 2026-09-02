import { NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';
import { openAiVectorStoreId } from '@/lib/env';
import { renditionPathFor, legacyRenditionPathFor } from '@/lib/ingest/paths';

export const runtime = 'nodejs';
// Streaming a 50 MB manual out of Supabase and into OpenAI can exceed the
// default function duration, so ask Vercel for the longer limit.
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireUser();
    const vectorStoreId = openAiVectorStoreId();
    if (!process.env.OPENAI_API_KEY || !vectorStoreId) {
      return NextResponse.json({ error: 'Ask Becky has not been configured in Vercel yet.' }, { status: 503 });
    }
    const { id } = await params;
    const { data: document, error: readError } = await supabase
      .from('documents').select('id,title,asset_id,storage_path,mime_type,openai_file_id').eq('id', id).single();
    if (readError || !document) return NextResponse.json({ error: 'Manual not found.' }, { status: 404 });

    // Prefer the Markdown rendition written by scripts/ingest, when there is
    // one. It carries each figure's label inline at the point the figure
    // appears, so a retrieved passage names the figure the reader should be
    // shown. It also rescues documents whose original has no text at all: the
    // electrical drawings are scans, and would otherwise index as an empty
    // file. Documents uploaded through the site have no rendition and fall
    // back to the original, which is the previous behaviour.
    const candidates = [renditionPathFor(document.id), legacyRenditionPathFor(document.storage_path)]
      .filter((path): path is string => Boolean(path));
    let source: Blob | null = null;
    for (const path of candidates) {
      const { data } = await supabase.storage.from('manuals').download(path);
      if (data) { source = data; break; }
    }
    const usingRendition = Boolean(source);
    let bytes: ArrayBuffer;
    let filename: string;
    let contentType: string;

    if (source) {
      bytes = await source.arrayBuffer();
      filename = `${document.id}.md`;
      contentType = 'text/markdown';
    } else {
      const { data: blob, error: downloadError } = await supabase.storage.from('manuals').download(document.storage_path);
      if (downloadError) throw downloadError;
      bytes = await blob.arrayBuffer();
      filename = document.storage_path.split('/').pop() || `${document.title}.pdf`;
      contentType = document.mime_type;
    }

    const openai = new OpenAI();
    const uploaded = await openai.files.create({
      file: await toFile(Buffer.from(bytes), filename, { type: contentType }),
      purpose: 'assistants',
    });
    // Re-indexing must not leave the previous copy in the store, or the same
    // manual answers twice with whichever text was indexed first.
    if (document.openai_file_id) {
      await openai.vectorStores.files.delete(document.openai_file_id, { vector_store_id: vectorStoreId }).catch(() => {});
      await openai.files.delete(document.openai_file_id).catch(() => {});
    }
    await openai.vectorStores.files.create(vectorStoreId, {
      file_id: uploaded.id,
      attributes: { asset_id: document.asset_id ?? 'general', title: document.title },
    });
    const { error: updateError } = await supabase.from('documents').update({ openai_file_id: uploaded.id, index_status: 'pending' }).eq('id', id);
    if (updateError) throw updateError;
    return NextResponse.json({ indexing: true, source: usingRendition ? 'rendition' : 'original' });
  } catch (error) {
    return apiError(error, 'Unable to index the manual.');
  }
}

