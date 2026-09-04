import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Only our own paths, so a crafted link cannot bounce someone off the site.
function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  // A recovery link exists so the reader can choose a password; sending them
  // to the family area instead would drop them back where they started.
  const next = type === 'recovery' ? '/set-password' : safeNext(url.searchParams.get('next')) ?? '/admin';
  const supabase = await createSupabaseServerClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL('/login?error=invalid-or-expired-link', url.origin));
}
