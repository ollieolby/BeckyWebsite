-- Figures pulled out of the uploaded manuals so Ask Becky can send the reader
-- the actual photo or diagram, not just a filename. The vector store only ever
-- sees a document's text, so a figure needs its own hand-written label and
-- keywords to be findable: the manual's photos have no captions at all and are
-- anchored only by phrases like "it's controlled here".
create table public.document_figures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  asset_id uuid references public.assets(id),
  -- Position in the source document, 1-based. Together with document_id this
  -- is the stable identity of a figure across re-ingests.
  figure_no integer not null check (figure_no > 0),
  -- Human-readable handle the model can cite, e.g. 'becky-manual-fig-05'.
  slug text not null unique,
  -- What to show the reader, e.g. 'Figure 5 - Main engine start panel'.
  label text not null,
  -- One sentence describing what is actually visible, including any arrow or
  -- circle annotation, so the model can tell near-identical photos apart.
  caption text not null default '',
  -- Heading the figure sat under in the source document.
  section text not null default '',
  -- Extra search terms: kit brand names, synonyms and the words a family
  -- member would actually type ('weed hatch', 'prop', 'propeller').
  keywords text[] not null default '{}',
  storage_path text not null unique,
  mime_type text not null,
  width integer,
  height integer,
  -- Tie-break between equally good keyword matches, lowest first. The family's
  -- own instruction manual outranks the sales spec and the drawings, so "where
  -- is the inverter" returns the photograph rather than a schematic that merely
  -- has the word on it.
  priority integer not null default 0,
  -- Excluded from retrieval but kept on record. Used for page furniture such
  -- as scheme logos, and for drawings that were superseded or rejected.
  is_published boolean not null default true,
  -- Why an unpublished figure is unpublished, or any caveat a reader needs.
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (document_id, figure_no)
);

create index document_figures_document_idx on public.document_figures (document_id, figure_no);
create index document_figures_keywords_idx on public.document_figures using gin (keywords);

alter table public.document_figures enable row level security;
create policy "family reads figures" on public.document_figures
for select to authenticated using (is_published or public.is_editor());
create policy "editors manage figures" on public.document_figures
for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- Private like the manuals: images are served through short-lived signed URLs
-- so an answer can embed a figure without making the bucket public.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('figures','figures',false,20971520,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy "family reads figures bucket" on storage.objects
for select to authenticated using (bucket_id='figures');
create policy "editors upload figures" on storage.objects
for insert to authenticated with check (bucket_id='figures' and public.is_editor());
create policy "editors update figures" on storage.objects
for update to authenticated using (bucket_id='figures' and public.is_editor());
create policy "editors delete figures" on storage.objects
for delete to authenticated using (bucket_id='figures' and public.is_editor());

-- The manuals bucket was created for PDFs and plain text only, at 50 MB. The
-- family's own documents are Word files and the instruction manual is 58 MB,
-- so every one of them was being rejected at upload. Widen both limits.
update storage.buckets set
  file_size_limit = 209715200,
  allowed_mime_types = array[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
where id = 'manuals';

-- Deliberately no anon/public policy for figures, unlike places and manuals:
-- these are interior photographs of a private home, and several show where
-- keys and hatches are. Publishing them is an explicit decision, not a default.
