import Link from 'next/link';
import Tracker from './tracker';

export const metadata = { title: 'Track me — Becky' };

export default function TrackerPage() {
  return (
    <main className="tracker-page">
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link>
        <nav aria-label="Main navigation">
          <Link href="/map">The map</Link>
          <Link href="/chat">Ask Becky</Link>
        </nav>
        <Link className="ask-small" href="/admin">Family area</Link>
      </header>
      <Tracker />
    </main>
  );
}
