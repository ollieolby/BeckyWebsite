import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await request.json();
    const title = String(body.title ?? '').trim();
    const problem = String(body.problem ?? '').trim();
    if (!title || !problem) return NextResponse.json({ error: 'A title and a description of the problem are required.' }, { status: 400 });
    const solution = String(body.solution ?? '').trim();
    const { data, error } = await supabase.from('troubleshooting').insert({
      title, problem, solution,
      status: solution ? 'solved' : 'open',
      asset_id: body.asset_id || null,
      created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return apiError(error, 'Unable to log the problem.');
  }
}
