import { NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';
import { openAiVectorStoreId } from '@/lib/env';

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

    const { data: blob, error: downloadError } = await supabase.storage.from('manuals').download(document.storage_path);
    if (downloadError) throw downloadError;
    const openai = new OpenAI();
    const filename = document.storage_path.split('/').pop() || `${document.title}.pdf`;
    const uploaded = await openai.files.create({
      file: await toFile(Buffer.from(await blob.arrayBuffer()), filename, { type: document.mime_type }),
      purpose: 'assistants',
    });
    await openai.vectorStores.files.create(vectorStoreId, {
      file_id: uploaded.id,
      attributes: { asset_id: document.asset_id ?? 'general', title: document.title },
    });
    const { error: updateError } = await supabase.from('documents').update({ openai_file_id: uploaded.id, index_status: 'pending' }).eq('id', id);
    if (updateError) throw updateError;
    return NextResponse.json({ indexing: true });
  } catch (error) {
    return apiError(error, 'Unable to index the manual.');
  }
}
