import Link from 'next/link';
import { Anchor } from '../marks';
import RiverMap from './river-map';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'The river map — Becky' };

export default function MapPage() {
  return (
    <main className="map-page">
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-mark">B</span><span>BECKY</span></Link>
        <nav aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link href="/tracker">Track me</Link>
          <Link href="/chat">Ask Becky</Link>
          <Link href="/add-information">Add information</Link>
        </nav>
        <Link className="ask-small" href="/admin">Family area</Link>
      </header>

      <div className="map-page-intro">
        <Anchor size={24} className="hero-mark" />
        <h1>The river map</h1>
        {/* Not in the nav: the nav is hidden below 760px, which left the
            tracker unreachable on the one device anybody would use it on. */}
        <Link href="/tracker" className="map-track-link">
          Track me
          <small>Speed and time to the next lock, while you are under way</small>
        </Link>
      </div>

      <RiverMap />
    </main>
  );
}
