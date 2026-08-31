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
        <nav aria-label="Main navigation"><a href="#vessels">The boats</a><a href="#explore">Explore</a><a href="#manuals">Manuals</a></nav>
        <button className="ask-small">Ask Becky <span>✦</span></button>
      </header>

      <section className="hero" id="top">
        <div className="river-line river-one" /><div className="river-line river-two" />
        <p className="kicker">A shared guide to life on the water</p>
        <h1>Everything you need<br />for <em>Becky</em> and beyond.</h1>
        <p className="hero-copy">Guides, local knowledge and answers for our boats and garden — all in one place.</p>
        <form className="ask-box">
          <span className="sparkle" aria-hidden="true">✦</span>
          <label className="sr-only" htmlFor="question">Ask a question</label>
          <input id="question" placeholder="How do I start the heating?" />
          <button type="submit">Ask Becky <span>→</span></button>
        </form>
        <p className="try-it">Try asking: <button>Where is the fuel shut-off?</button> <i>·</i> <button>Best pub nearby?</button></p>
      </section>

      <section className="vessels" id="vessels">
        <div className="section-heading">
          <div><p className="kicker">Our little corner of the river</p><h2>Three places, one shared story</h2></div>
          <p>Practical notes and hard-won knowledge, kept together for both families.</p>
        </div>
        <div className="card-grid">
          {sections.map((section) => (
            <a className={`place-card ${section.accent}`} href="#explore" key={section.name}>
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
            <a href="#manuals" key={title}><span className="quick-icon">{title.charAt(0)}</span><span><strong>{title}</strong><small>{description}</small></span><b>{arrow}</b></a>
          ))}
        </div>
      </section>

      <footer id="manuals"><span className="brand-mark inverse">B</span><p>Made for the crews of Becky, Cormorant &amp; Drakar.</p><span>On the river · 2026</span></footer>
    </main>
  );
}
