alter table public.places add column if not exists google_maps_url text;
alter table public.places add column if not exists image_path text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('place-images','place-images',false,10485760,array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy "family reads place images" on storage.objects
for select to authenticated using (bucket_id='place-images');
create policy "editors upload place images" on storage.objects
for insert to authenticated with check (bucket_id='place-images' and public.is_editor());
create policy "editors update place images" on storage.objects
for update to authenticated using (bucket_id='place-images' and public.is_editor());
create policy "editors delete place images" on storage.objects
for delete to authenticated using (bucket_id='place-images' and public.is_editor());
