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
        const file = await openai.vectorStores.files.retrieve(vectorStoreId, document.openai_file_id!);
        if (file.status === 'completed' || file.status === 'failed') {
          const { error } = await supabase.from('documents').update({ index_status: file.status === 'completed' ? 'indexed' : 'failed' }).eq('id', document.id);
          if (!error) reconciled++;
        }
      } catch { /* A later status check can retry reconciliation. */ }
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
