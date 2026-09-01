import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PlacesMap from '../places-map';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ASSET_SLUGS = ['becky', 'cormorant', 'drakar'];
const CATEGORY_LABELS: Record<string, string> = { mooring: 'Mooring', pub: 'Pub', cafe: 'Café', shop: 'Shop', fuel: 'Fuel', other: 'Other' };

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ asset: string }> }): Promise<Metadata> {
  const { asset } = await params;
  const name = asset.charAt(0).toUpperCase() + asset.slice(1);
  return { title: `${name} — The boat guide` };
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
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
  const [{ data: documents }, { data: generalDocuments }, { data: guides }, { data: problems }, places] = await Promise.all([
    supabase.from('documents').select('id,title,notes,mime_type,size_bytes,created_at').eq('asset_id', asset.id).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,title,notes,mime_type,size_bytes,created_at').is('asset_id', null).order('created_at', { ascending: false }),
    supabase.from('guides').select('id,title,summary,body,updated_at').eq('asset_id', asset.id).order('updated_at', { ascending: false }),
    supabase.from('troubleshooting').select('id,title,problem,solution,status,updated_at').eq('asset_id', asset.id).order('updated_at', { ascending: false }),
    slug === 'cormorant'
      ? supabase.from('places').select('id,name,category,notes,google_maps_url').order('name')
      : Promise.resolve({ data: null }),
  ]);

  const documentSections = [
    { heading: `${asset.name} manuals & documents`, items: documents ?? [] },
    { heading: 'Shared & general documents', items: generalDocuments ?? [] },
  ];

  return (
    <main className="asset-page">
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link>
        <nav aria-label="Main navigation">
          {ASSET_SLUGS.map(item => <Link key={item} href={`/${item}`} className={item === slug ? 'active' : ''}>{item.charAt(0).toUpperCase() + item.slice(1)}</Link>)}
          <Link href="/chat">Ask Becky</Link>
        </nav>
        <Link className="ask-small" href="/admin">Family area <span>✦</span></Link>
      </header>

      <section className="asset-hero">
        <p className="kicker">{asset.description}</p>
        <h1>{asset.name}</h1>
        <p>Everything the families keep about {asset.name} — manuals, guides and hard-won knowledge. <Link href="/admin">Add something new</Link> in the family area.</p>
      </section>

      {documentSections.map(({ heading, items }) => (
        <section className="asset-section" key={heading}>
          <h2>{heading}</h2>
          {items.length ? (
            <div className="asset-doc-grid">
              {items.map(item => (
                <a className="asset-doc" key={item.id} href={`/api/documents/${item.id}/file`} target="_blank" rel="noreferrer">
                  <strong>📄 {item.title}</strong>
                  {item.notes && <p>{item.notes}</p>}
                  <small>{item.mime_type === 'application/pdf' ? 'PDF' : 'Text'} · {fileSize(item.size_bytes)} · added {shortDate(item.created_at)} · open ↗</small>
                </a>
              ))}
            </div>
          ) : <p className="asset-empty">Nothing here yet.</p>}
        </section>
      ))}

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

      {slug === 'cormorant' && (
        <section className="asset-section">
          <h2>The river map & places</h2>
          <PlacesMap />
          {!!places.data?.length && (
            <div className="asset-doc-grid asset-places">
              {places.data.map(place => (
                <div className="asset-doc" key={place.id}>
                  <strong>{CATEGORY_LABELS[place.category] ?? place.category} · {place.name}</strong>
                  {place.notes && <p>{place.notes}</p>}
                  {place.google_maps_url && <small><a href={place.google_maps_url} target="_blank" rel="noreferrer">Open in Google Maps ↗</a></small>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <footer><span className="brand-mark inverse">B</span><p>Made for the crews of Becky, Cormorant &amp; Drakar.</p><span>On the river · 2026</span></footer>
    </main>
  );
}
