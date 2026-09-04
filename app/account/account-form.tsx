'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function AccountForm({ displayName }: { displayName: string }) {
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setMessage('Give yourself a name.');
    setBusy(true);
    setMessage('Saving…');
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.assign('/login'); return; }
    // select() so the reply says which rows changed. Row-level security that
    // matches nothing is not an error — the update simply affects no rows and
    // still comes back 200, which would have this page report a save that
    // never happened.
    const { data, error } = await supabase
      .from('profiles').update({ display_name: trimmed }).eq('id', user.id).select('display_name');
    setMessage(
      error ? `Could not save that (${error.message}).`
        : !data?.length ? 'That did not save — your account may not have permission to change it.'
        : 'Saved.',
    );
    setBusy(false);
  }

  async function signOut() {
    setSigningOut(true);
    // Clears the session cookie as well as local storage, so the server stops
    // seeing the reader as signed in too.
    await createSupabaseBrowserClient().auth.signOut();
    location.assign('/');
  }

  return (
    <>
      <form className="account-form" onSubmit={save}>
        <label>
          Your name
          <input
            value={name} onChange={event => setName(event.target.value)}
            placeholder="How you appear to the family" maxLength={60} autoComplete="name"
          />
        </label>
        <button type="submit" disabled={busy || name.trim() === displayName.trim()}>
          {busy ? 'Saving…' : 'Save name'}
        </button>
        {message && <p className="account-status" role="status">{message}</p>}
      </form>

      <div className="account-actions">
        <Link className="account-secondary" href="/set-password">Change your password</Link>
        <button type="button" className="account-signout" onClick={signOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </>
  );
}
