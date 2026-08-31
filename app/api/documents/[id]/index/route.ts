import { NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { requireUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireUser();
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_VECTOR_STORE_ID) {
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
    const indexed = await openai.vectorStores.files.createAndPoll(process.env.OPENAI_VECTOR_STORE_ID, {
      file_id: uploaded.id,
      attributes: { asset_id: document.asset_id ?? 'general', title: document.title },
    });
    const indexStatus = indexed.status === 'completed' ? 'indexed' : 'failed';
    const { error: updateError } = await supabase.from('documents').update({ openai_file_id: uploaded.id, index_status: indexStatus }).eq('id', id);
    if (updateError) throw updateError;
    if (indexStatus !== 'indexed') return NextResponse.json({ error: `OpenAI returned ${indexed.status}.` }, { status: 502 });
    return NextResponse.json({ indexed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to index the manual.';
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHENTICATED' ? 401 : 500 });
  }
}
