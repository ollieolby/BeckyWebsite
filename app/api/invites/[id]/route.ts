import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

// Withdraw an invite. Kept rather than deleted so the redemption record still
// says which link let someone in.
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireUser();
    const { id } = await params;
    const { data, error } = await supabase.from('invites')
      .update({ revoked: true }).eq('id', id).select('id,revoked').maybeSingle();
    if (error) return NextResponse.json({ error: `Could not withdraw it (${error.message}).` }, { status: 403 });
    if (!data) return NextResponse.json({ error: 'No invite with that id.' }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error, 'Unable to withdraw the invite.');
  }
}
