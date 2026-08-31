'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (cooldown > 0) return;

    setCooldown(30);
    setMessage('Sending your secure sign-in link…');
    const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setMessage(error ? error.message : 'Email sent. Check your inbox and spam folder.');
  }

  return (
    <main className="auth-page">
      <form className="admin-panel login-card" onSubmit={submit}>
        <span className="brand-mark">B</span>
        <p className="kicker">Family access</p>
        <h1>Sign in to Becky</h1>
        <p>We’ll email you a secure one-time link. No password to remember.</p>
        <label>
          Email address
          <input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
        </label>
        <button type="submit" disabled={cooldown > 0}>
          {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send sign-in link'}
        </button>
        {message && <p role="status" aria-live="polite">{message}</p>}
      </form>
    </main>
  );
}
