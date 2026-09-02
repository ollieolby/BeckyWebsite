import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import Library, { type LibraryDoc } from './library';
import { Anchor } from '../marks';

const ASSET_SLUGS = ['becky', 'cormorant', 'drakar'];

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ asset: string }> }): Promise<Metadata> {
  const { asset } = await params;
  const name = asset.charAt(0).toUpperCase() + asset.slice(1);
  return { title: `${name} — The boat guide` };
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function AssetPage({ params }: { params: Promise<{ asset: string }> }) {
  const { asset: slug } = await params;
  if (!ASSET_SLUGS.includes(slug)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: asset } = await supabase.from('assets').select('id,name,slug,description').eq('slug', slug).maybeSingle();
  if (!asset) notFound();

  // Row-level security shapes all of these to the viewer: visitors get
  // published content only, family members see everything (and only they
  // can read the troubleshooting log at all).
  const { data: { user } } = await supabase.auth.getUser();

  // Row-level security shapes all of these to the viewer: visitors get
  // published content only, family members see everything (and only they can
  // read the troubleshooting log at all).
  const [{ data: documents, error: documentsError }, { data: generalDocuments }, { data: guides }, { data: problems }, { data: figures }] = await Promise.all([
    supabase.from('documents').select('id,title,summary,notes,mime_type,size_bytes,created_at,doc_kind').eq('asset_id', asset.id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,title,summary,notes,mime_type,size_bytes,created_at,doc_kind').is('asset_id', null).order('created_at', { ascending: false }),
    supabase.from('guides').select('id,title,summary,body,updated_at').eq('asset_id', asset.id).order('updated_at', { ascending: false }),
    supabase.from('troubleshooting').select('id,title,problem,solution,status,updated_at').eq('asset_id', asset.id).order('updated_at', { ascending: false }),
    supabase.from('document_figures').select('document_id').eq('asset_id', asset.id).eq('is_published', true),
  ]);

  const figureCount = new Map<string, number>();
  for (const figure of figures ?? []) {
    figureCount.set(figure.document_id, (figureCount.get(figure.document_id) ?? 0) + 1);
  }
  const library: LibraryDoc[] = [
    ...(documents ?? []).map(doc => ({ ...doc, general: false, figures: figureCount.get(doc.id) ?? 0 })),
    ...(generalDocuments ?? []).map(doc => ({ ...doc, general: true, figures: 0 })),
  ];

  return (
    <main className="asset-page">
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link>
        <nav aria-label="Main navigation">
          {ASSET_SLUGS.map(item => <Link key={item} href={`/${item}`} className={item === slug ? 'active' : ''}>{item.charAt(0).toUpperCase() + item.slice(1)}</Link>)}
          <Link href="/map">The map</Link>
          <Link href="/chat">Ask Becky</Link>
        </nav>
        <Link className="ask-small" href="/admin">Family area</Link>
      </header>

      <section className="asset-hero">
        <Anchor size={24} className="hero-mark" />
        <h1>{asset.name}</h1>
        {!user && (
          <p className="asset-signin">
            Some documents are family-only and are hidden while you are signed out.{' '}
            <Link href="/login">Sign in</Link> to see everything.
          </p>
        )}
      </section>

      <section className="asset-section">
        <h2>Documents</h2>
        {documentsError
          // Without this the page renders an empty library and a 200, which
          // looks exactly like having no documents. A query that failed and a
          // shelf that is genuinely bare must not look the same.
          ? <p className="asset-error">The library could not be read: {documentsError.message}</p>
          : <Library documents={library} assetName={asset.name} />}
      </section>

      <section className="asset-section">
        <h2>Guides</h2>
        {guides?.length ? guides.map(guide => (
          <details className="asset-guide" key={guide.id}>
            <summary><strong>{guide.title}</strong>{guide.summary && <span>{guide.summary}</span>}</summary>
            <div className="asset-guide-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{guide.body}</ReactMarkdown></div>
          </details>
        )) : <p className="asset-empty">No guides written for {asset.name} yet — ask Becky to save one from a chat.</p>}
      </section>

      {problems !== null && (
        <section className="asset-section">
          <h2>Troubleshooting log</h2>
          {problems?.length ? problems.map(problem => (
            <article className={`asset-problem ${problem.status}`} key={problem.id}>
              <header><strong>{problem.title}</strong><span className="asset-status">{problem.status === 'solved' ? '✓ Solved' : '● Open'}</span><small>{shortDate(problem.updated_at)}</small></header>
              <p><b>Problem:</b> {problem.problem}</p>
              {problem.solution && <p><b>Fix:</b> {problem.solution}</p>}
            </article>
          )) : <p className="asset-empty">Nothing logged for {asset.name}. Tell Becky about a fault in the chat and it can log it here.</p>}
        </section>
      )}

      <footer><span className="brand-mark inverse">B</span><p>Made for the crews of Becky, Cormorant &amp; Drakar.</p><span>On the river · 2026</span></footer>
    </main>
  );
}
