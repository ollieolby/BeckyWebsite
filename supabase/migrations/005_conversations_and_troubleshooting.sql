-- Chat history: each signed-in family member keeps their own conversations.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New chat',
  messages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
create policy "own conversations" on public.conversations
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Troubleshooting log: problems aboard and how they were solved. Read by the
-- whole family (and by Ask Becky through its tools); written by editors.
create table public.troubleshooting (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id),
  title text not null,
  problem text not null,
  solution text not null default '',
  status text not null default 'open' check (status in ('open','solved')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.troubleshooting enable row level security;
create policy "family reads troubleshooting" on public.troubleshooting
for select to authenticated using (true);
create policy "editors manage troubleshooting" on public.troubleshooting
for all to authenticated using (public.is_editor()) with check (public.is_editor());
