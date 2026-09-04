'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { MIN_PASSWORD, passwordProblem } from '@/lib/password';

// Reached from the emailed link, which signs the reader in first. Also works
// for anyone already signed in who wants to change their password.
const timers: ReturnType<typeof setTimeout>[] = [];

export default function SetPasswordPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    const settle = (address: string | null) => {
      if (cancelled) return;
      setReady(Boolean(address));
      setEmail(address ?? '');
    };

    // A recovery link can arrive either as ?code= or as a token in the URL
    // fragment, and the fragment is read asynchronously after the page paints.
    // Deciding on the first check calls a good link expired, so this listens
    // for the session as well and only gives up after it has had a moment.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) settle(session.user.email ?? '');
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) return settle(data.session.user.email ?? '');
      const grace = setTimeout(async () => {
        const { data: late } = await supabase.auth.getSession();
        settle(late.session?.user?.email ?? null);
      }, 2500);
      timers.push(grace);
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); timers.forEach(clearTimeout); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password, email);
    if (problem) return setMessage(problem);
    if (password !== confirm) return setMessage('The two passwords are not the same.');

    setBusy(true);
    setMessage('Saving…');
    const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
    if (error) {
      setMessage(/should be different/i.test(error.message)
        ? 'That is the password you already have. Choose a different one.'
        : error.message);
      setBusy(false);
      return;
    }
    setMessage('Saved. Taking you to the family area…');
    location.assign('/admin');
  }

  if (ready === false) {
    return (
      <main className="auth-page">
        <div className="admin-panel login-card">
          <span className="brand-mark">B</span>
          <h1>This link has expired</h1>
          <p>Password links are good for an hour. Ask for a fresh one.</p>
          <p className="login-aside"><Link href="/reset-password">Email me a new link</Link></p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form className="admin-panel login-card" onSubmit={submit}>
        <span className="brand-mark">B</span>
        <h1>Choose a password</h1>
        {email && <p>For {email}.</p>}
        {/* Hidden but present so a password manager knows which login this
            new password belongs to. */}
        <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
        <label>
          New password
          <input
            type="password" required autoComplete="new-password" minLength={MIN_PASSWORD}
            value={password} onChange={event => setPassword(event.target.value)}
          />
        </label>
        <label>
          Type it again
          <input
            type="password" required autoComplete="new-password"
            value={confirm} onChange={event => setConfirm(event.target.value)}
          />
        </label>
        <p className="login-quiet">At least {MIN_PASSWORD} characters. A few unrelated words is plenty.</p>
        <button type="submit" disabled={busy || ready === null || !password || !confirm}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
        {message && <p role="status" aria-live="polite">{message}</p>}
      </form>
    </main>
  );
}
