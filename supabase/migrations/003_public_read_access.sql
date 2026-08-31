create policy "public reads assets" on public.assets
for select to anon using (true);

create policy "public reads published places" on public.places
for select to anon using (is_published);

create policy "public reads published guides" on public.guides
for select to anon using (is_published);

alter table public.documents add column if not exists is_published boolean not null default false;

create policy "public reads published document catalogue" on public.documents
for select to anon using (is_published);

create policy "public reads manuals" on storage.objects
for select to anon using (
  bucket_id='manuals' and exists (
    select 1 from public.documents where storage_path=storage.objects.name and is_published
  )
);

create policy "public reads place images" on storage.objects
for select to anon using (
  bucket_id='place-images' and exists (
    select 1 from public.places where image_path=storage.objects.name and is_published
  )
);
