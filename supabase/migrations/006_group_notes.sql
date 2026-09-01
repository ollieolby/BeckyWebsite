-- Shared family notes are live RAG memory. They stay in Supabase so edits are
-- available to Ask Becky immediately without re-indexing a vector file.
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id),
  title text not null,
  body text not null,
  source text not null default 'manual' check (source in ('manual','chat')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;
create policy "family reads notes" on public.notes
for select to authenticated using (true);
create policy "family creates notes" on public.notes
for insert to authenticated with check (created_by = auth.uid());
create policy "editors update notes" on public.notes
for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "editors delete notes" on public.notes
for delete to authenticated using (public.is_editor());
