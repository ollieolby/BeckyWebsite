import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireUser } from '@/lib/supabase/server';
import { apiError } from '@/lib/api-error';

export const runtime = 'nodejs';

// Create an invite link. Editors only — enforced by the invites RLS policy, so
// a viewer's insert fails at the database rather than relying on this check.
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await request.json();

    const role = body.role === 'editor' ? 'editor' : 'viewer';
    const maxUses = Math.min(Math.max(Number(body.max_uses) || 1, 1), 50);
    const days = Number(body.expires_days);
    const expiresAt = days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null;

    // 32 random bytes, url-safe. Long enough that guessing is not a concern,
    // short enough to paste into a message.
    const token = randomBytes(24).toString('base64url');

    const { data, error } = await supabase.from('invites').insert({
      token,
      label: String(body.label ?? '').trim().slice(0, 120),
      role,
      max_uses: maxUses,
      expires_at: expiresAt,
      created_by: user.id,
    }).select('id,token,label,role,max_uses,uses,expires_at,created_at').single();

    if (error) {
      return NextResponse.json({ error: `Could not create the invite (${error.message}). You may need editor access.` }, { status: 403 });
    }

    const origin = new URL(request.url).origin;
    return NextResponse.json({ ...data, url: `${origin}/join/${data.token}` }, { status: 201 });
  } catch (error) {
    return apiError(error, 'Unable to create the invite.');
  }
}
