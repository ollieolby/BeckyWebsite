import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

// Redeem an invite link. This is the only route in the site that can create an
// account: open sign-up is switched off in Supabase Auth, so signInWithOtp
// cannot make one, and the invites table is invisible to unauthenticated
// clients. Both the check and the account creation happen here, server-side.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!token || !email) return NextResponse.json({ error: 'An invite and an email address are required.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 });

    // apiError echoes Error.message to the caller, and this route is public,
    // so a missing service key must not surface as a config detail.
    let admin;
    try {
      admin = createSupabaseAdminClient();
    } catch {
      console.error('/api/join: SUPABASE_SERVICE_ROLE_KEY is not configured');
      return NextResponse.json({ error: 'Invites are not set up on this site yet. Tell whoever sent you the link.' }, { status: 503 });
    }

    // Already a member: there is nothing to create and the invite is not
    // spent. Answered identically to a fresh signup so the page cannot be
    // used to find out whether a given address belongs to the family.
    const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    if (existing) return NextResponse.json({ ok: true });

    // Atomic: two people opening the same single-use link at the same moment
    // cannot both get through. Raises on unknown, expired, revoked or spent.
    const { data: claim, error: claimError } = await admin
      .rpc('claim_invite', { invite_token: token, invitee_email: email })
      .single<{ invite_id: string; granted_role: string }>();

    if (claimError) {
      const reason = /INVITE_(\w+)/.exec(claimError.message)?.[1];
      const message = reason === 'EXPIRED' ? 'That invite link has expired. Ask whoever sent it for a new one.'
        : reason === 'REVOKED' ? 'That invite link has been withdrawn.'
        : reason === 'USED_UP' ? 'That invite link has already been used.'
        : 'That invite link is not valid.';
      return NextResponse.json({ error: message }, { status: 403 });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      return NextResponse.json({ error: 'Could not create the account. Try again, or ask for a new invite.' }, { status: 500 });
    }

    // handle_new_user has already made the profile; apply the role the invite
    // granted, and tie the redemption record to the account it produced.
    if (claim && claim.granted_role !== 'viewer') {
      await admin.from('profiles').update({ role: claim.granted_role }).eq('id', created.user.id);
    }
    if (claim) {
      await admin.from('invite_redemptions')
        .update({ user_id: created.user.id })
        .eq('invite_id', claim.invite_id).eq('email', email).is('user_id', null);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'Unable to accept the invite.');
  }
}
