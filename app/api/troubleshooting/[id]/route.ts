import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const title = String(body.title ?? '').trim();
    const problem = String(body.problem ?? '').trim();
    if (!title || !problem) return NextResponse.json({ error: 'A title and a description of the problem are required.' }, { status: 400 });
    const { data, error } = await supabase.from('troubleshooting').update({
      title, problem,
      solution: String(body.solution ?? '').trim(),
      status: body.status === 'solved' ? 'solved' : 'open',
      asset_id: body.asset_id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error, 'Unable to update the problem.');
  }
}
