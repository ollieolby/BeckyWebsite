import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

// Approve, correct or discard a figure. Editors only, enforced by the
// document_figures RLS policy.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireUser();
    const { id } = await params;
    const body = await request.json();

    const label = String(body.label ?? '').trim();
    if (!label) return NextResponse.json({ error: 'A label is required.' }, { status: 400 });

    const keywords = typeof body.keywords === 'string'
      ? body.keywords.split(',').map((word: string) => word.trim().toLowerCase()).filter(Boolean)
      : Array.isArray(body.keywords) ? body.keywords : undefined;

    const changes: Record<string, unknown> = {
      label,
      caption: String(body.caption ?? '').trim(),
      is_published: Boolean(body.is_published),
    };
    if (keywords) changes.keywords = keywords;
    // Approving is what turns a machine guess into something a reader can be
    // sent, and it clears the model's own doubts because a person has looked.
    if (body.is_published) {
      changes.caption_source = 'reviewed';
      changes.uncertain = '';
    }

    const { data, error } = await supabase.from('document_figures')
      .update(changes).eq('id', id).select('id,slug,is_published,caption_source').maybeSingle();
    if (error) return NextResponse.json({ error: `Could not save it (${error.message}). You may need editor access.` }, { status: 403 });
    if (!data) return NextResponse.json({ error: 'No figure with that id.' }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error, 'Unable to update the figure.');
  }
}

// Discard a figure that is not worth keeping - a logo, a decorative photo, a
// page of white space.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireUser();
    const { id } = await params;
    const { data: figure } = await supabase.from('document_figures').select('storage_path').eq('id', id).maybeSingle();
    const { error } = await supabase.from('document_figures').delete().eq('id', id);
    if (error) return NextResponse.json({ error: `Could not remove it (${error.message}).` }, { status: 403 });
    if (figure) await supabase.storage.from('figures').remove([figure.storage_path]);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return apiError(error, 'Unable to remove the figure.');
  }
}
