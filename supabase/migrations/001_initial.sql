create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'viewer' check (role in ('viewer','editor','admin')),
  created_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('becky','cormorant','drakar')),
  name text not null,
  description text not null default ''
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('mooring','pub','cafe','shop','fuel','other')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  notes text not null default '',
  website_url text,
  is_published boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guides (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id),
  title text not null,
  slug text not null unique,
  summary text not null default '',
  body text not null default '',
  is_published boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id),
  title text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  openai_file_id text,
  index_status text not null default 'pending' check (index_status in ('pending','indexed','failed')),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id,email,display_name)
  values (new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

insert into public.assets (slug,name,description) values
  ('becky','Becky','The houseboat'),
  ('cormorant','Cormorant','The boat garden'),
  ('drakar','Drakar','The runaround boat')
on conflict (slug) do nothing;

create or replace function public.is_editor() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('editor','admin'));
$$;

alter table public.profiles enable row level security;
alter table public.assets enable row level security;
alter table public.places enable row level security;
alter table public.guides enable row level security;
alter table public.documents enable row level security;

create policy "family can read profiles" on public.profiles for select to authenticated using (true);
create policy "family can read assets" on public.assets for select to authenticated using (true);
create policy "family can read places" on public.places for select to authenticated using (is_published or public.is_editor());
create policy "family can read guides" on public.guides for select to authenticated using (is_published or public.is_editor());
create policy "family can read documents" on public.documents for select to authenticated using (true);
create policy "editors manage places" on public.places for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "editors manage guides" on public.guides for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "editors manage documents" on public.documents for all to authenticated using (public.is_editor()) with check (public.is_editor());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('manuals','manuals',false,52428800,array['application/pdf','text/plain','text/markdown'])
on conflict (id) do nothing;
create policy "family reads manuals" on storage.objects for select to authenticated using (bucket_id='manuals');
create policy "editors upload manuals" on storage.objects for insert to authenticated with check (bucket_id='manuals' and public.is_editor());
create policy "editors update manuals" on storage.objects for update to authenticated using (bucket_id='manuals' and public.is_editor());
create policy "editors delete manuals" on storage.objects for delete to authenticated using (bucket_id='manuals' and public.is_editor());
