import { createClient } from '@supabase/supabase-js';

// Service-role client. Bypasses row-level security entirely, so it must only
// ever be constructed inside a route handler that has already decided the
// caller is allowed to do the thing being done.
//
// The invite flow needs it for two reasons: the invites table is unreadable to
// anon (a public policy would leak every live token), and creating an account
// while Supabase Auth has open sign-up switched off is an admin-only action.
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
