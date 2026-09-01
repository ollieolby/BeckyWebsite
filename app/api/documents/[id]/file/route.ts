import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

// Opens the original uploaded manual. Row-level security decides who can see
// it: signed-in family members see every manual, visitors only published ones.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { id } = await params;
    const { data: document } = await supabase.from('documents').select('storage_path').eq('id', id).maybeSingle();
    if (!document) return NextResponse.json({ error: 'Manual not found.' }, { status: 404 });
    const { data, error } = await supabase.storage.from('manuals').createSignedUrl(document.storage_path, 900);
    if (error || !data) throw error ?? new Error('Could not create a link to the manual.');
    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    return apiError(error, 'Unable to open the manual.');
  }
}
