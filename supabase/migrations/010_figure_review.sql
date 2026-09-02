-- Figures can now be produced by the site itself: a family member uploads a
-- manual and the server extracts its images and asks a vision model to
-- describe each one. Those descriptions are guesses, so they are held back
-- until a person has looked at them.
alter table public.document_figures
  -- 'human' for the hand-written manifest, 'pending' for an extracted figure
  -- not yet described, 'ai' for a machine-proposed caption awaiting review,
  -- 'reviewed' once a person has checked or corrected one.
  add column if not exists caption_source text not null default 'human'
    check (caption_source in ('human', 'pending', 'ai', 'reviewed'));

-- What the model said it could not make out. Shown to the reviewer, and
-- cleared when they approve.
alter table public.document_figures
  add column if not exists uncertain text not null default '';

create index if not exists document_figures_review_idx
  on public.document_figures (caption_source) where not is_published;

-- Machine captions must never reach a reader unreviewed. is_published already
-- gates retrieval, so this only has to make the default safe: anything the
-- site captions itself starts unpublished, and approving it is a human act.
-- Existing hand-written figures are unaffected by the default above.

-- Progress and problems from the last processing run, shown on the document
-- in the family area so a failed extraction is visible rather than silent.
alter table public.documents
  add column if not exists process_status text not null default 'none'
    check (process_status in ('none', 'processing', 'done', 'failed'));
alter table public.documents
  add column if not exists process_message text not null default '';
