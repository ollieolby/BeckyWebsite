-- A one-line description written for a person.
--
-- `notes` was being used for two jobs at once: rich context for Ask Becky, and
-- the description shown on the asset pages. The AI context is long and written
-- in the second person to the model ("never quote this as the current rules"),
-- which read badly on screen and made a card grid of wildly uneven heights.
-- The two audiences now have their own field.
alter table public.documents
  add column if not exists summary text not null default '';

-- What kind of thing this is, so the library can be grouped and filtered
-- rather than being one long undifferentiated list.
alter table public.documents
  add column if not exists doc_kind text not null default 'manual'
    check (doc_kind in ('manual', 'certificate', 'drawing', 'specification', 'reference', 'notes'));
