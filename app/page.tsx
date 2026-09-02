import { Suspense } from 'react';
import Link from 'next/link';
import { Anchor, Waterline, DutchBarge, ShepherdsHut, Speedboat } from './marks';
import AskBecky from './ask-becky';
import RiverStatus from './river-status';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const sections = [
  { name: 'Becky', eyebrow: 'Houseboat', text: 'Systems, safety, arrival and departure guides for life aboard.', accent: 'becky', Art: DutchBarge },
  { name: 'Cormorant', eyebrow: 'The boat garden', text: 'Everything about the plot, sheds, utilities and looking after the land.', accent: 'cormorant', Art: ShepherdsHut },
  { name: 'Drakar', eyebrow: 'Runaround boat', text: 'Launch notes, engine guide and the essentials for getting underway.', accent: 'drakar', Art: Speedboat },
];

const quickLinks = [
  ['Ask Becky', 'Answers from our manuals, notes and the live river', '/chat'],
  ['The river map', 'Moorings, pubs, cafés and useful stops', '/map'],
  ['Add information', 'Upload a manual or write down what you know', '/add-information'],
];

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    : { data: null };
  const signedInName = profile?.display_name?.trim() || user?.email?.split('@')[0] || null;
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Becky home"><span className="brand-mark">B</span><span>BECKY</span></a>
        <nav aria-label="Main navigation"><a href="#vessels">The boats</a><a href="#explore">Explore</a><Link href="/chat">Ask Becky</Link><Link href="/add-information">Add information</Link></nav>
        <Link className="ask-small" href="/admin">{signedInName ? `Hi, ${signedInName}` : 'Family area'}</Link>
      </header>

      <section className="hero" id="top">
        <Anchor className="hero-mark" size={30} />
        <h1>Everything you need for <em>Becky</em> and beyond.</h1>
        <AskBecky />
        <Suspense fallback={null}><RiverStatus /></Suspense>
        <Waterline />
      </section>

      <section className="vessels" id="vessels">
        <div className="card-grid">
          {sections.map((section) => (
            <a className={`place-card ${section.accent}`} href={`/${section.accent}`} key={section.name}>
              <div className="card-art"><section.Art /></div>
              <div className="card-copy"><p>{section.eyebrow}</p><h3>{section.name}</h3><span>{section.text}</span><b>Explore <i>→</i></b></div>
            </a>
          ))}
        </div>
      </section>

      <section className="explore" id="explore">
        <h2>Useful, even with wet hands.</h2>
        <div className="quick-links">
          {quickLinks.map(([title, description, href]) => (
            <a href={href} key={title}><span className="quick-icon">{title.charAt(0)}</span><span><strong>{title}</strong><small>{description}</small></span><b>↗</b></a>
          ))}
        </div>
      </section>

      <footer id="manuals"><span className="brand-mark inverse">B</span><p>Made for the crews of Becky, Cormorant &amp; Drakar.</p><span className="footer-position"><Anchor size={15} /> Bourne End · River Thames</span></footer>
    </main>
  );
}
