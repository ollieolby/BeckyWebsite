import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AdminForms from '../admin/admin-forms';
import NotesPanel from '../admin/notes-panel';

export const dynamic = 'force-dynamic';

// Adding information has its own page rather than a panel on the homepage, so
// there is one address to send someone to and one place that explains what
// happens. Signed out, it explains and offers the way in; signed in, it is the
// forms themselves.
export default async function AddInformationPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { data: assets }, { data: notes }] = user
    ? await Promise.all([
        supabase.from('profiles').select('display_name,email,role').eq('id', user.id).single(),
        supabase.from('assets').select('id,name,slug').order('name'),
        supabase.from('notes').select('id,title,body,asset_id,source').order('updated_at', { ascending: false }),
      ])
    : [{ data: null }, { data: [] }, { data: [] }];
  const canEdit = profile?.role === 'editor' || profile?.role === 'admin';
  return (
    <main className="add-page">
      <header>
        <Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link>
        {user
          ? <div><strong>{profile?.display_name || user.email}</strong><small>{profile?.role ?? 'viewer'}</small></div>
          : <Link className="ask-small" href="/login">Sign in <span>✦</span></Link>}
      </header>
      <section>
        <p className="kicker">Keep our knowledge growing</p>
        <h1>Add information</h1>
        <p className="add-lede">
          Found a good mooring? Learnt how something aboard works? Put it here while it is fresh, so both
          families — and Ask Becky — can find it next time.
        </p>
        <ol className="add-steps">
          <li className={user ? 'done' : 'now'}>
            <span>1</span>
            <div>
              <strong>Sign in</strong>
              <small>
                {user
                  ? `Signed in as ${profile?.email ?? user.email}.`
                  : 'Accounts are invite-only. If you have not got one, ask a family member to send you an invite link.'}
              </small>
            </div>
          </li>
          <li className={user ? 'now' : ''}>
            <span>2</span>
            <div><strong>Choose what you are adding</strong><small>A manual, a place on the map, a note, or a problem and how it was fixed.</small></div>
          </li>
          <li>
            <span>3</span>
            <div><strong>Save it</strong><small>Manuals are indexed so Ask Becky can quote them and show their figures. Notes are searchable straight away.</small></div>
          </li>
        </ol>
        {!user && (
          <p className="add-cta">
            <Link className="add-primary" href="/login">Sign in to add information <span>→</span></Link>
          </p>
        )}
        {user && !canEdit && (
          <p className="add-note">
            Your account is <strong>view-only</strong>, so you can read everything and add shared notes, but not
            upload manuals or edit places. Ask an admin to make you an editor if you need to.
          </p>
        )}
        {user && (
          <>
            <AdminForms assets={assets ?? []} canEdit={canEdit} />
            <NotesPanel assets={assets ?? []} notes={notes ?? []} canEdit={canEdit} />
            {canEdit && (
              <p className="add-note">
                Managing what is already there — editing, unpublishing, re-indexing, invite links — lives in
                the <Link href="/admin">family area</Link>.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
