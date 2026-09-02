-- Supplementary information: a note can now be attached to a manual, and to a
-- particular figure within it.
--
-- The manuals are fixed documents. Correcting one means editing the source
-- file and re-running the ingest, which needs the repo and a Mac, and a
-- re-ingest replaces the figure rows wholesale. Notes are the opposite: they
-- live in Postgres, are edited in the browser, are read live by Ask Becky with
-- no re-indexing, and survive a re-ingest untouched. So a clarification or a
-- correction belongs here rather than in the document.
alter table public.notes
  add column if not exists document_id uuid references public.documents(id) on delete cascade;

-- Kept as the figure's slug rather than a foreign key: a re-ingest deletes and
-- re-inserts every figure row for a document, so an id would dangle, while the
-- slug is derived from the document key and figure number and is stable.
alter table public.notes
  add column if not exists figure_slug text;

create index if not exists notes_document_idx on public.notes (document_id);
create index if not exists notes_figure_idx on public.notes (figure_slug);
