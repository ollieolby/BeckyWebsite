alter table public.documents
add column if not exists notes text not null default '';
