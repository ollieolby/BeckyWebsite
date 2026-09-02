import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

// Figures waiting for a person to check them, with a short-lived URL for each
// image so the reviewer can actually see what they are approving.
export async function GET() {
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from('document_figures')
      .select('id,slug,figure_no,label,caption,keywords,section,uncertain,caption_source,storage_path,documents(title)')
      .in('caption_source', ['ai', 'pending'])
      .eq('is_published', false)
      .order('slug')
      .limit(200);
    if (error) throw error;

    const figures = [];
    for (const row of data ?? []) {
      const { data: signed } = await supabase.storage.from('figures').createSignedUrl(row.storage_path, 3600);
      const document = Array.isArray(row.documents) ? row.documents[0] : row.documents;
      figures.push({
        id: row.id, slug: row.slug, figure_no: row.figure_no,
        label: row.label, caption: row.caption, keywords: row.keywords ?? [],
        section: row.section, uncertain: row.uncertain,
        caption_source: row.caption_source,
        document_title: document?.title ?? '',
        image_url: signed?.signedUrl ?? null,
      });
    }
    return NextResponse.json({ figures });
  } catch (error) {
    return apiError(error, 'Unable to list figures for review.');
  }
}
