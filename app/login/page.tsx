'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (cooldown > 0) return;

    setCooldown(30);
    setMessage('Sending your sign-in email…');
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) return setMessage(error.message);
      setSent(true);
      setMessage('Email sent. Click the link, or type the code from the email below — the code works even when the link has “expired”.');
    } catch {
      setMessage('Could not send the email. Check your connection and try again.');
    }
  }

  // Corporate mail scanners often pre-open magic links, which burns the
  // one-time token before the reader ever clicks it. Typing the code from the
  // same email avoids that entirely, and works in any browser or profile.
  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setVerifying(true);
    setMessage('Checking the code…');
    try {
      const { error } = await createSupabaseBrowserClient().auth.verifyOtp({
        email,
        token: code.trim(),
        type: 'email',
      });
      if (error) {
        setMessage(error.message === 'Token has expired or is invalid'
          ? 'That code is wrong or has expired. Request a fresh email and use its newest code.'
          : error.message);
        setVerifying(false);
        return;
      }
      setMessage('Signed in. Taking you to the family area…');
      location.assign('/admin');
    } catch {
      setMessage('Could not check the code. Check your connection and try again.');
      setVerifying(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="admin-panel login-card" onSubmit={submit}>
        <span className="brand-mark">B</span>
        <p className="kicker">Family access</p>
        <h1>Sign in to Becky</h1>
        <p>We’ll email you a sign-in link and a one-time code. No password to remember.</p>
        <label>
          Email address
          <input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
        </label>
        <button type="submit" disabled={cooldown > 0}>
          {cooldown > 0 ? `Send again in ${cooldown}s` : sent ? 'Send a new email' : 'Send sign-in email'}
        </button>
        {message && <p role="status" aria-live="polite">{message}</p>}
      </form>
      {sent && (
        <form className="admin-panel login-card" onSubmit={verifyCode}>
          <p className="kicker">Or use the code</p>
          <label>
            6-digit code from the email
            <input
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
              value={code} onChange={event => setCode(event.target.value)} placeholder="123456"
            />
          </label>
          <button type="submit" disabled={verifying || code.trim().length < 6}>
            {verifying ? 'Checking…' : 'Sign in with code'}
          </button>
        </form>
      )}
    </main>
  );
}
