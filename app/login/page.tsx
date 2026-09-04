'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

function SignIn() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    params.get('error') === 'invalid-or-expired-link' ? 'That link has expired. Sign in below, or reset your password.' :
    params.get('reset') === 'done' ? 'Password saved. Sign in with it below.' : '',
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('Signing in…');
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        // Supabase answers the same way for a wrong password and an unknown
        // address, which is the right thing: it stops this page being used to
        // find out who has an account.
        setMessage(/invalid login credentials/i.test(error.message)
          ? 'That email and password do not match. If you have not set a password yet, use “Forgot your password?”.'
          : /email not confirmed/i.test(error.message)
            ? 'This account has not been confirmed yet. Use “Forgot your password?” to finish setting it up.'
            : error.message);
        setBusy(false);
        return;
      }
      setMessage('Signed in. Taking you to the family area…');
      location.assign('/admin');
    } catch {
      setMessage('Could not reach the site. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="admin-panel login-card" onSubmit={submit}>
        <span className="brand-mark">B</span>
        <h1>Sign in to Becky</h1>
        <label>
          Email address
          <input
            type="email" name="email" required autoComplete="username" inputMode="email"
            value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password" name="password" required autoComplete="current-password"
            value={password} onChange={event => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {message && <p role="status" aria-live="polite">{message}</p>}
        <p className="login-aside">
          <Link href="/reset-password">Forgot your password?</Link>
        </p>
        <p className="login-aside login-quiet">
          Accounts are invite only. If you have not got one, ask a family member to send you a link.
        </p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><SignIn /></Suspense>;
}
