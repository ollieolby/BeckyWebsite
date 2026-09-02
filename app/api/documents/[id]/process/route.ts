import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';
import { processDocumentBatch, ProcessError } from '@/lib/ingest/process';

export const runtime = 'nodejs';
// Extraction of a large manual plus a vision call per figure in the batch.
export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireUser();
    const { id } = await params;
    const result = await processDocumentBatch(supabase, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProcessError) return NextResponse.json({ error: error.message }, { status: 400 });
    return apiError(error, 'Unable to read the manual.');
  }
}
