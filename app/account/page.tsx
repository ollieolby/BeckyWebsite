import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AccountForm from './account-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your account — Becky' };

const ROLE_WORDS: Record<string, string> = {
  admin: 'Administrator — can do everything, including inviting people',
  editor: 'Editor — can add and change manuals, places and notes',
  viewer: 'Viewer — can read everything and add shared notes',
};

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('display_name,email,role,created_at').eq('id', user.id).single();
  const role = profile?.role ?? 'viewer';

  return (
    <main className="account-page">
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link>
        <nav aria-label="Main navigation">
          <Link href="/map">The map</Link>
          <Link href="/chat">Ask Becky</Link>
          <Link href="/admin">Family area</Link>
        </nav>
        <span />
      </header>

      <section>
        <h1>Your account</h1>
        <dl className="account-facts">
          <div><dt>Signed in as</dt><dd>{profile?.email ?? user.email}</dd></div>
          <div><dt>Access</dt><dd>{ROLE_WORDS[role] ?? role}</dd></div>
          {profile?.created_at && (
            <div>
              <dt>Joined</dt>
              <dd>{new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            </div>
          )}
        </dl>

        <AccountForm displayName={profile?.display_name ?? ''} />
      </section>
    </main>
  );
}
