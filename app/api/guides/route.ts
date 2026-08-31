import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';

export async function GET() {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from('guides').select('*, assets(slug,name)').order('updated_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data);
  } catch { return NextResponse.json({ error: 'Sign in required.' }, { status: 401 }); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await request.json();
    if (!body.title || !body.slug) return NextResponse.json({ error: 'Title and slug are required.' }, { status: 400 });
    const { data, error } = await supabase.from('guides').insert({
      title: String(body.title).trim(), slug: String(body.slug).trim().toLowerCase(),
      summary: String(body.summary ?? ''), body: String(body.body ?? ''),
      asset_id: body.asset_id || null, is_published: Boolean(body.is_published), created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save guide.' }, { status: 500 }); }
}
