'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { MIN_PASSWORD, passwordProblem } from '@/lib/password';

type Stage = 'details' | 'done';

export default function JoinForm({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('details');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function accept(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password, email);
    if (problem) return setMessage(problem);
    if (password !== confirm) return setMessage('The two passwords are not the same.');

    setBusy(true);
    setMessage('Setting up your account…');
    try {
      // Creates the account with this password. Open sign-up is off, so the
      // browser cannot make one on its own; the invite is checked server-side.
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? 'That invite could not be accepted.');
        setBusy(false);
        return;
      }

      // Straight in, no email to go and find.
      const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (error) {
        setMessage('Your account is ready, but signing in failed. Try the sign-in page.');
        setBusy(false);
        return;
      }
      setStage('done');
      setMessage('Welcome aboard.');
      location.assign('/');
    } catch {
      setMessage('Could not reach the site. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <main className="join-page">
      <Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link>
      <section>
        <p className="kicker">You have been invited</p>
        <h1>Join the Becky handbook</h1>
        <p className="join-intro">
          This is the shared handbook for <strong>Becky</strong> the houseboat, <strong>Cormorant</strong> the
          boat garden and <strong>Drakar</strong> the runaround boat: the manuals, the places we go, and an
          assistant that answers from them.
        </p>

        <ol className="join-steps">
          <li className={stage === 'details' ? 'now' : 'done'}><span>1</span><div><strong>Your email and a password</strong><small>The invite decides who can join — you cannot sign up without one.</small></div></li>
          <li className={stage === 'done' ? 'now' : ''}><span>2</span><div><strong>You are in</strong><small>Ask Becky anything, and add what you know from Add information.</small></div></li>
        </ol>

        {stage === 'details' && (
          <form onSubmit={accept} className="join-form">
            <label htmlFor="join-email">Your email address</label>
            <input
              id="join-email" type="email" required autoComplete="username" inputMode="email"
              value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"
            />
            <label htmlFor="join-password">Choose a password</label>
            <input
              id="join-password" type="password" required autoComplete="new-password" minLength={MIN_PASSWORD}
              value={password} onChange={event => setPassword(event.target.value)}
            />
            <label htmlFor="join-confirm">Type it again</label>
            <input
              id="join-confirm" type="password" required autoComplete="new-password"
              value={confirm} onChange={event => setConfirm(event.target.value)}
            />
            <p className="join-hint">At least {MIN_PASSWORD} characters. A few unrelated words is plenty.</p>
            <button type="submit" disabled={busy || !email || !password || !confirm}>
              {busy ? 'Setting up…' : 'Create my account'}
            </button>
          </form>
        )}

        {message && <p className="join-message" role="status">{message}</p>}
        <p className="join-foot">Already have an account? <Link href="/login">Sign in</Link>.</p>
      </section>
    </main>
  );
}
