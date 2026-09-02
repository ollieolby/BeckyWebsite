import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';
import { renditionPathFor, legacyRenditionPathFor } from '@/lib/ingest/paths';

export const runtime = 'nodejs';

// A readable version of a document for the browser.
//
// Word files cannot be displayed in a page at all, so linking the original
// gave a blank frame or a surprise download. Every document already has a
// Markdown rendition for the search index, so that is what gets shown - with
// the figure markers swapped back for the actual photographs, which makes the
// manual more readable on screen than the .docx it came from.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { id } = await params;

    const { data: document } = await supabase
      .from('documents').select('id,title,storage_path,mime_type,notes').eq('id', id).maybeSingle();
    if (!document) return NextResponse.json({ error: 'Manual not found.' }, { status: 404 });

    const candidates = [renditionPathFor(document.id), legacyRenditionPathFor(document.storage_path)]
      .filter((path): path is string => Boolean(path));
    let markdown: string | null = null;
    for (const path of candidates) {
      const { data } = await supabase.storage.from('manuals').download(path);
      if (data) { markdown = await data.text(); break; }
    }
    if (markdown === null) {
      return NextResponse.json({
        available: false,
        title: document.title,
        mime_type: document.mime_type,
        reason: 'This document has not been read yet, so there is no readable version. Open the original instead.',
      });
    }

    // Swap each figure marker for the picture itself.
    const { data: figures } = await supabase
      .from('document_figures').select('slug,label,caption,storage_path')
      .eq('document_id', id).eq('is_published', true);

    for (const figure of figures ?? []) {
      const { data: signed } = await supabase.storage.from('figures').createSignedUrl(figure.storage_path, 3600);
      if (!signed?.signedUrl) continue;
      // The marker is one line beginning "[Figure <slug> " and ending at the
      // closing bracket; it is written by the ingest, not by a person.
      const pattern = new RegExp(`\\[Figure ${escapeRegExp(figure.slug)}[^\\]]*\\]`, 'g');
      markdown = markdown.replace(pattern, `\n![${figure.label.replace(/[[\]]/g, '')}](${signed.signedUrl})\n\n*${figure.caption}*\n`);
    }
    // Any figure still awaiting review, or withheld, is named but not shown.
    markdown = markdown.replace(/\[Figure ([a-z0-9-]+)[^\]]*\]/g, '*(figure $1 is not available)*');

    return NextResponse.json({
      available: true,
      title: document.title,
      markdown,
      figures: (figures ?? []).length,
    });
  } catch (error) {
    return apiError(error, 'Unable to open the manual.');
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
