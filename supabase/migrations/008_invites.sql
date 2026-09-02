-- Invite links. Open sign-up is switched off in Supabase Auth, so the only way
-- to get an account is through one of these.
--
-- The token lives in a URL that an editor sends to someone. It is checked by
-- /api/join using the service-role key, never by the browser: the anon key is
-- public, so any policy that let an unauthenticated client read this table
-- would hand out every live token to anyone who asked.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  -- Who it was sent to, so the list is readable months later.
  label text not null default '',
  -- Visitors get 'viewer'. Family who will add content get 'editor'.
  role text not null default 'viewer' check (role in ('viewer','editor')),
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index invites_token_idx on public.invites (token);

alter table public.invites enable row level security;
-- No anon policy and no viewer policy, deliberately: only editors see tokens.
create policy "editors manage invites" on public.invites
for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- Record of who came in on which invite, so an account can be traced back to
-- the link that created it.
create table public.invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  email text not null,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.invite_redemptions enable row level security;
create policy "editors read redemptions" on public.invite_redemptions
for select to authenticated using (public.is_editor());

-- Claiming an invite has to be atomic: two people opening the same
-- single-use link at once must not both get in. Runs as the definer so the
-- join route can call it without exposing the table.
create or replace function public.claim_invite(invite_token text, invitee_email text)
returns table (invite_id uuid, granted_role text)
language plpgsql security definer set search_path = '' as $$
declare
  found public.invites;
begin
  select * into found from public.invites
  where token = invite_token
  for update;

  if found.id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;
  if found.revoked then
    raise exception 'INVITE_REVOKED';
  end if;
  if found.expires_at is not null and found.expires_at < now() then
    raise exception 'INVITE_EXPIRED';
  end if;
  if found.uses >= found.max_uses then
    raise exception 'INVITE_USED_UP';
  end if;

  update public.invites
  set uses = uses + 1, last_used_at = now()
  where id = found.id;

  insert into public.invite_redemptions (invite_id, email) values (found.id, invitee_email);

  invite_id := found.id;
  granted_role := found.role;
  return next;
end;
$$;

revoke all on function public.claim_invite(text, text) from public, anon, authenticated;
