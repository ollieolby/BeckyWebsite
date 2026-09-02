import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireUser } from '@/lib/supabase/server';
import { openAiVectorStoreId } from '@/lib/env';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { supabase } = await requireUser();
    const vectorStoreId = openAiVectorStoreId();
    if (!process.env.OPENAI_API_KEY || !vectorStoreId) {
      return NextResponse.json({ connected: false, message: 'OpenAI has not been configured in Vercel yet.' });
    }
    const openai = new OpenAI();
    const store = await openai.vectorStores.retrieve(vectorStoreId);
    const { data: pending } = await supabase.from('documents').select('id,openai_file_id').eq('index_status', 'pending').not('openai_file_id', 'is', null);
    let reconciled = 0;
    await Promise.all((pending ?? []).map(async document => {
      try {
        // retrieve takes the file id first and the store in params. Called the
        // other way round it throws every time, and with the error swallowed
        // below nothing ever moved off 'pending' however long the vector store
        // had been finished with it.
        const file = await openai.vectorStores.files.retrieve(document.openai_file_id!, { vector_store_id: vectorStoreId });
        if (file.status === 'completed' || file.status === 'failed') {
          const { error } = await supabase.from('documents').update({ index_status: file.status === 'completed' ? 'indexed' : 'failed' }).eq('id', document.id);
          if (!error) reconciled++;
        }
      } catch (error) {
        // A later check can retry, but a failure that repeats forever should
        // not be invisible.
        console.error('[rag status] could not reconcile', document.id, error instanceof Error ? error.message : error);
      }
    }));
    return NextResponse.json({
      connected: store.status === 'completed',
      status: store.status,
      name: store.name,
      files: store.file_counts,
      usageBytes: store.usage_bytes,
      reconciled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check Ask Becky.';
    return NextResponse.json({ connected: false, message }, { status: message === 'UNAUTHENTICATED' ? 401 : 502 });
  }
}
