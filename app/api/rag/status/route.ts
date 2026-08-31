import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireUser();
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_VECTOR_STORE_ID) {
      return NextResponse.json({ connected: false, message: 'OpenAI has not been configured in Vercel yet.' });
    }
    const store = await new OpenAI().vectorStores.retrieve(process.env.OPENAI_VECTOR_STORE_ID);
    return NextResponse.json({
      connected: store.status === 'completed',
      status: store.status,
      name: store.name,
      files: store.file_counts,
      usageBytes: store.usage_bytes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check Ask Becky.';
    return NextResponse.json({ connected: false, message }, { status: message === 'UNAUTHENTICATED' ? 401 : 502 });
  }
}
