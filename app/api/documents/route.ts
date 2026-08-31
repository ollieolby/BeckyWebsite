import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

// The file itself is uploaded from the browser straight to Supabase Storage
// (Vercel functions reject bodies over ~4.5 MB), so this route only records
// metadata after verifying the object really exists under the caller's prefix.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await request.json();
    const title = String(body.title ?? '').trim();
    const notes = String(body.notes ?? '').trim();
    const assetId = body.asset_id ? String(body.asset_id) : null;
    const storagePath = String(body.storage_path ?? '');
    if (!title || !storagePath) return NextResponse.json({ error: 'A title and an uploaded file are required.' }, { status: 400 });
    if (!storagePath.startsWith(`${user.id}/`)) return NextResponse.json({ error: 'That file was not uploaded by your account.' }, { status: 403 });

    const { data: object, error: infoError } = await supabase.storage.from('manuals').info(storagePath);
    if (infoError || !object) return NextResponse.json({ error: 'The uploaded file could not be found in storage. Try the upload again.' }, { status: 400 });

    const { data, error } = await supabase.from('documents').insert({
      title, notes, asset_id: assetId, storage_path: storagePath,
      mime_type: object.contentType || 'application/octet-stream',
      size_bytes: object.size ?? Number(body.size_bytes ?? 0),
      openai_file_id: null, index_status: 'pending',
      is_published: Boolean(body.is_published), uploaded_by: user.id,
    }).select().single();
    if (error) {
      await supabase.storage.from('manuals').remove([storagePath]).catch(() => {});
      throw error;
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return apiError(error, 'Unable to save the manual.');
  }
}
