'use client';

import { useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { MANUAL_ACCEPT, MANUAL_MAX_BYTES, manualTypeFor, manualTypeError } from '@/lib/manual-types';

// Adding a manual from the chat itself.
//
// The file goes from the browser straight to Supabase Storage - a Vercel
// function rejects bodies over about 4.5 MB, and manuals are much bigger than
// that - and only then is the metadata recorded. Reading it happens in
// batches, because a manual with thirty photographs needs a vision call for
// each and will not finish inside one request.
export default function UploadDocument({ onDone, disabled }: { onDone: (summary: string) => void; disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    const contentType = manualTypeFor(file.name);
    if (!contentType) return setStatus(manualTypeError(file.name));
    if (file.size > MANUAL_MAX_BYTES) return setStatus('That file is over 150 MB. Ask someone to shrink it first.');

    setBusy(true);
    const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || file.name;
    const supabase = createSupabaseBrowserClient();
    let path: string | null = null;

    try {
      setStatus('Uploading…');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You need to be signed in to add a manual.');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('manuals')
        .upload(path, file, { contentType: file.type || contentType, upsert: false });
      if (uploadError) throw new Error(`The upload failed: ${uploadError.message}`);

      setStatus('Saving…');
      const created = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, storage_path: path, size_bytes: file.size, is_published: false }),
      });
      const document = await created.json();
      if (!created.ok) throw new Error(document.error ?? 'The manual could not be saved.');
      path = null;   // handed over; no longer ours to clean up

      // Extraction first, then captioning a few figures at a time.
      let figures = 0;
      for (let round = 0; round < 40; round++) {
        const response = await fetch(`/api/documents/${document.id}/process`, { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'The manual could not be read.');
        figures = result.figures ?? figures;
        if (result.done) break;
        setStatus(round === 0
          ? `Found ${result.figures} picture(s). Describing them…`
          : `Describing pictures… ${result.remaining} to go`);
      }

      setStatus('');
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
      onDone(
        `I've added **${title}**${figures ? ` and found ${figures} picture(s) in it` : ''}.\n\n`
        + (figures
          ? 'I\'ve written a description of each one by looking at it. They are hidden until someone checks them — open the family area and look under **Needs a look**.\n\n'
          : '')
        + 'It still needs indexing before I can search its text: that\'s the **Index for Ask Becky** button in the family area.',
      );
    } catch (error) {
      if (path) supabase.storage.from('manuals').remove([path]).catch(() => {});
      setStatus(error instanceof Error ? error.message : 'Something went wrong adding that manual.');
      setBusy(false);
    }
  }

  return (
    <div className="chat-upload">
      <input
        ref={fileRef} type="file" accept={MANUAL_ACCEPT} id="chat-upload-input" hidden
        onChange={event => { const file = event.target.files?.[0]; if (file) handle(file); }}
      />
      <button
        type="button" className="chat-upload-button" disabled={busy || disabled}
        onClick={() => fileRef.current?.click()}
        title="Add a PDF, Word .docx, .txt or .md manual"
      >
        {busy ? '⋯' : '＋'} <span>{busy ? 'Reading…' : 'Add a manual'}</span>
      </button>
      {status && <span className="chat-upload-status" role="status">{status}</span>}
    </div>
  );
}
