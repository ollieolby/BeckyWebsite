-- Let someone change their own display name from the account page.
--
-- The row-level policy alone would be dangerous: it can say which rows may be
-- written but not which columns, so a viewer could update their own row and
-- set role = 'admin'. The column grant is what actually stops that — with
-- update revoked and only display_name granted back, no other column can be
-- written by an ordinary session however the request is shaped.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());
