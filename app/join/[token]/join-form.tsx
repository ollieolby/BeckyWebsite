'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Stage = 'email' | 'code' | 'done';

export default function JoinForm({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<Stage>('email');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function accept(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('Checking your invite…');
    try {
      // Creates the account if the invite is good. Open sign-up is off, so
      // signInWithOtp below cannot create one on its own.
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, email }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? 'That invite could not be accepted.');
        setBusy(false);
        return;
      }

      const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
      setStage('code');
      setMessage('Account ready. We have emailed you a sign-in link and a code.');
    } catch {
      setMessage('Could not reach the site. Check your connection and try again.');
    }
    setBusy(false);
  }

  // Mail scanners often pre-open magic links, burning the one-time token
  // before the reader clicks. The code from the same email always works.
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setMessage('Checking the code…');
    const { error } = await createSupabaseBrowserClient().auth.verifyOtp({
      email, token: code.trim(), type: 'email',
    });
    if (error) {
      setMessage('That code is wrong or has expired. Request a fresh email from the sign-in page.');
      setBusy(false);
      return;
    }
    setStage('done');
    setMessage('Signed in.');
    location.assign('/');
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
          <li className={stage === 'email' ? 'now' : 'done'}><span>1</span><div><strong>Enter your email</strong><small>The invite decides who can join — you cannot sign up without one.</small></div></li>
          <li className={stage === 'code' ? 'now' : stage === 'done' ? 'done' : ''}><span>2</span><div><strong>Open the email</strong><small>Click the link, or type the code below if the link has been used up.</small></div></li>
          <li className={stage === 'done' ? 'now' : ''}><span>3</span><div><strong>You are in</strong><small>Ask Becky anything, and add what you know from Add information.</small></div></li>
        </ol>

        {stage === 'email' && (
          <form onSubmit={accept} className="join-form">
            <label htmlFor="join-email">Your email address</label>
            <input id="join-email" type="email" required autoComplete="email" value={email}
              onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
            <button type="submit" disabled={busy || !email}>Accept invite</button>
          </form>
        )}

        {stage === 'code' && (
          <form onSubmit={verify} className="join-form">
            <label htmlFor="join-code">Code from the email</label>
            <input id="join-code" inputMode="numeric" autoComplete="one-time-code" value={code}
              onChange={event => setCode(event.target.value)} placeholder="123456" />
            <button type="submit" disabled={busy || !code.trim()}>Sign in</button>
          </form>
        )}

        {message && <p className="join-message" role="status">{message}</p>}
        <p className="join-foot">Already have an account? <Link href="/login">Sign in</Link>.</p>
      </section>
    </main>
  );
}
