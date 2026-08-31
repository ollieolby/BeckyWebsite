import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const form = await request.formData();
    const file = form.get('file');
    const title = String(form.get('title') ?? '').trim();
    const assetId = String(form.get('asset_id') ?? '') || null;
    if (!(file instanceof File) || !title) return NextResponse.json({ error: 'A title and file are required.' }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'Files must be 50 MB or smaller.' }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage.from('manuals').upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.from('documents').insert({
      title, asset_id: assetId, storage_path: path, mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size, openai_file_id: null, index_status: 'pending',
      is_published: form.get('is_published') === 'on', uploaded_by: user.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 500 });
  }
}
