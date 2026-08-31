import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';

export async function GET() {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.from('places').select('*').order('name');
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await request.json();
    const latitude = Number(body.latitude), longitude = Number(body.longitude);
    if (!body.name || !body.category || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: 'Name, category and valid coordinates are required.' }, { status: 400 });
    }
    const { data, error } = await supabase.from('places').insert({
      name: String(body.name).trim(), category: body.category, latitude, longitude,
      notes: String(body.notes ?? ''), website_url: body.website_url || null,
      is_published: body.is_published !== false, created_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return apiError(error); }
}

function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return NextResponse.json({ error: message }, { status: message === 'UNAUTHENTICATED' ? 401 : 500 });
}
