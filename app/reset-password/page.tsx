'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('Sending…');
    const { error } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/set-password`,
    });
    // Deliberately the same answer either way: telling the reader that an
    // address has no account would let anyone check who is in the family.
    setSent(true);
    setBusy(false);
    setMessage(error && !/user not found/i.test(error.message)
      ? error.message
      : 'If that address has an account, a link is on its way. It is good for one hour.');
  }

  return (
    <main className="auth-page">
      <form className="admin-panel login-card" onSubmit={submit}>
        <span className="brand-mark">B</span>
        <h1>Set a new password</h1>
        <p>We will email you a link to choose one.</p>
        <label>
          Email address
          <input
            type="email" required autoComplete="username" inputMode="email"
            value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"
          />
        </label>
        <button type="submit" disabled={busy || !email.trim() || sent}>
          {busy ? 'Sending…' : sent ? 'Link sent' : 'Email me a link'}
        </button>
        {message && <p role="status" aria-live="polite">{message}</p>}
        <p className="login-aside"><Link href="/login">Back to signing in</Link></p>
      </form>
    </main>
  );
}
