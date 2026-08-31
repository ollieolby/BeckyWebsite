import AskBecky from './ask-becky';

const sections = [
  { name: 'Becky', eyebrow: 'Houseboat', text: 'Systems, safety, arrival and departure guides for life aboard.', accent: 'becky', icon: 'B' },
  { name: 'Cormorant', eyebrow: 'The boat garden', text: 'Everything about the plot, sheds, utilities and looking after the land.', accent: 'cormorant', icon: 'C' },
  { name: 'Drakar', eyebrow: 'Runaround boat', text: 'Launch notes, engine guide and the essentials for getting underway.', accent: 'drakar', icon: 'D' },
];

const quickLinks = [
  ['Manuals & guides', 'Find instructions and original documents', '↗'],
  ['Places nearby', 'Pubs, cafés, shops and useful stops', '↗'],
  ['Mooring map', 'Saved spots, notes and local knowledge', '↗'],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Becky home"><span className="brand-mark">B</span><span>BECKY</span></a>
        <nav aria-label="Main navigation"><a href="#vessels">The boats</a><a href="#explore">Explore</a><a href="#add-information">Add information</a></nav>
        <a className="ask-small" href="/admin">Family area <span>✦</span></a>
      </header>

      <section className="hero" id="top">
        <div className="river-line river-one" /><div className="river-line river-two" />
        <p className="kicker">A shared guide to life on the water</p>
        <h1>Everything you need<br />for <em>Becky</em> and beyond.</h1>
        <p className="hero-copy">Guides, local knowledge and answers for our boats and garden — all in one place.</p>
        <AskBecky />
      </section>

      <section className="vessels" id="vessels">
        <div className="section-heading">
          <div><p className="kicker">Our little corner of the river</p><h2>Three places, one shared story</h2></div>
          <p>Practical notes and hard-won knowledge, kept together for both families.</p>
        </div>
        <div className="card-grid">
          {sections.map((section) => (
            <a className={`place-card ${section.accent}`} href="/admin" key={section.name}>
              <div className="card-art"><span className="monogram">{section.icon}</span><span className="wave wave-a" /><span className="wave wave-b" /></div>
              <div className="card-copy"><p>{section.eyebrow}</p><h3>{section.name}</h3><span>{section.text}</span><b>Explore <i>→</i></b></div>
            </a>
          ))}
        </div>
      </section>

      <section className="explore" id="explore">
        <div><p className="kicker">Find your way around</p><h2>Useful, even with wet hands.</h2></div>
        <div className="quick-links">
          {quickLinks.map(([title, description, arrow]) => (
            <a href="/admin" key={title}><span className="quick-icon">{title.charAt(0)}</span><span><strong>{title}</strong><small>{description}</small></span><b>{arrow}</b></a>
          ))}
        </div>
      </section>

      <section className="add-information" id="add-information">
        <div className="add-information-copy">
          <p className="kicker">Keep our knowledge growing</p>
          <h2>Add something useful</h2>
          <p>Found a good mooring? Learnt how something aboard works? Upload it while it’s fresh, so both families can find it next time.</p>
          <a className="add-primary" href="/admin">Add information <span>→</span></a>
        </div>
        <div className="add-options">
          <a href="/admin"><span>01</span><strong>Upload a manual</strong><small>Add a PDF or practical document</small><b>→</b></a>
          <a href="/admin"><span>02</span><strong>Save a place</strong><small>Paste a Maps link and add our notes</small><b>→</b></a>
          <a href="/admin"><span>03</span><strong>Share a useful note</strong><small>Capture family knowledge and checklists</small><b>→</b></a>
        </div>
      </section>

      <footer id="manuals"><span className="brand-mark inverse">B</span><p>Made for the crews of Becky, Cormorant &amp; Drakar.</p><span>On the river · 2026</span></footer>
    </main>
  );
}
