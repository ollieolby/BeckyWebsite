// Drawn marks, not glyphs.
//
// The site used the ⚓ emoji as its nautical signal, which renders as a
// different picture on every platform and cannot be given a weight, a colour
// or a stroke that matches anything else. These are authored at a single
// 1.6px stroke on a 24-unit grid so they sit with the rest of the type.

export function Anchor({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" className={className}
      fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      <circle cx="12" cy="4.1" r="2.1" />
      <path d="M12 6.2V21" />
      <path d="M8 9.6h8" />
      <path d="M4.4 14.2c0 3.9 3.4 6.8 7.6 6.8s7.6-2.9 7.6-6.8" />
      <path d="M4.4 14.2 2.2 12.8M4.4 14.2l2.4-1M19.6 14.2l2.2-1.4M19.6 14.2l-2.4-1" />
    </svg>
  );
}

// A tileable wave. One period is 300 units wide, so a strip of eight periods
// can be slid left by exactly four and land back where it started - the loop
// has no seam and needs no JavaScript.
const PERIOD = 300;
const TILES = 10;
// `phase` slides one layer against the other so their crests never line up and
// the pair reads as water rather than as one thick band.
const wavePath = (amplitude: number, baseline: number, phase = 0) => {
  const crest = `c${PERIOD * 0.25} ${-amplitude} ${PERIOD * 0.75} ${amplitude} ${PERIOD} 0`;
  return `M${-PERIOD + phase} ${baseline} ${Array(TILES).fill(crest).join(' ')} V60 H${-PERIOD + phase} Z`;
};

// Becky herself, near enough: dark hull, cream wheelhouse, red rubbing strake,
// and a pennant. She pootles across the hero and the front wave passes over
// her hull, which is what sells it as water rather than as a sticker.
export function Boat() {
  return (
    <div className="boat" aria-hidden="true">
      <div className="boat-bob">
        <svg width="96" height="62" viewBox="0 0 96 62" fill="none">
          <g className="boat-smoke">
            <circle cx="55" cy="20" r="2.6" />
            <circle cx="55" cy="20" r="2.2" />
            <circle cx="55" cy="20" r="1.8" />
          </g>
          {/* mast and pennant */}
          <path d="M22 40V13" stroke="var(--deep-water)" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M22 14h11l-4 3.2 4 3.2H22z" fill="var(--rust)" />
          {/* wheelhouse */}
          <rect x="48" y="24" width="22" height="15" rx="2.5" fill="#f4efe3" stroke="var(--deep-water)" strokeWidth="1.6" />
          <path d="M53 29h4.5M62 29h4.5" stroke="var(--deep-water)" strokeWidth="1.4" strokeLinecap="round" />
          {/* chimney */}
          <path d="M55 24v-4.5" stroke="var(--deep-water)" strokeWidth="2.4" strokeLinecap="round" />
          {/* hull */}
          <path d="M6 39h84c-2.5 9.5-9 13.5-19 13.5H25C15 52.5 8.5 48.5 6 39Z" fill="var(--deep-water)" />
          <path d="M6 39h84" stroke="var(--rust)" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export function Waterline() {
  return (
    <div className="waterline" aria-hidden="true">
      <svg className="waterline-layer waterline-far" viewBox={`0 0 ${PERIOD * (TILES - 2)} 60`} preserveAspectRatio="none">
        <path d={wavePath(13, 26)} />
      </svg>
      <Boat />
      <svg className="waterline-layer waterline-near" viewBox={`0 0 ${PERIOD * (TILES - 2)} 60`} preserveAspectRatio="none">
        <path d={wavePath(19, 38, PERIOD * 0.45)} />
      </svg>
    </div>
  );
}

// The three places, drawn. They replace initials in circles, which told the
// reader nothing and gave Cormorant and Drakar the same shape as Becky.
// One flat palette across all three so they read as a set: dark hull and
// ironwork, cream superstructure, a rust accent.
const DARK = 'var(--deep-water)';
const CREAM = '#f4efe3';
const RUST = 'var(--rust)';

export function DutchBarge() {
  return (
    <svg className="place-art" viewBox="0 0 180 100" fill="none" aria-hidden="true">
      {/* mast and pennant */}
      <path d="M28 58V14" stroke={DARK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M28 16h14l-5 4 5 4H28z" fill={RUST} />
      {/* cabin with its arched windows, then the wheelhouse aft */}
      <rect x="44" y="38" width="74" height="20" rx="2" fill={CREAM} />
      {[52, 68, 84, 100].map(x => (
        <path key={x} d={`M${x} 52v-6a4 4 0 0 1 8 0v6z`} fill={DARK} opacity=".85" />
      ))}
      <path d="M122 30h34v28h-34z" fill={CREAM} />
      <path d="M120 28h38" stroke={DARK} strokeWidth="3" strokeLinecap="round" />
      <path d="M128 46h8M142 46h8" stroke={DARK} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M62 38v-7" stroke={DARK} strokeWidth="3" strokeLinecap="round" />
      {/* hull */}
      <path d="M8 58h164c-5 18-16 26-34 26H42C24 84 13 76 8 58Z" fill={DARK} />
      <path d="M8 58h164" stroke={RUST} strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

export function ShepherdsHut() {
  return (
    <svg className="place-art" viewBox="0 0 180 100" fill="none" aria-hidden="true">
      {/* corrugated barrel roof */}
      <path d="M30 40C30 18 54 8 90 8s60 10 60 32z" fill={DARK} />
      {[46, 62, 78, 94, 110, 126].map(x => (
        <path key={x} d={`M${x} ${x < 90 ? 34 - (x - 46) * 0.42 : 34 - (134 - x) * 0.42}V12`} stroke={CREAM} strokeWidth="1" opacity=".22" />
      ))}
      <path d="M44 22v-9" stroke={DARK} strokeWidth="3.4" strokeLinecap="round" />
      {/* body, door and window */}
      <path d="M34 40h112v36H34z" fill={CREAM} />
      <path d="M76 46h26v30H76z" fill={DARK} />
      <path d="M82 52h14v8H82z" fill={CREAM} opacity=".7" />
      <path d="M112 48h22v14h-22z" fill={DARK} opacity=".85" />
      {/* cart wheels and the ground it stands on */}
      <circle cx="56" cy="80" r="9" fill={DARK} />
      <circle cx="56" cy="80" r="3" fill={CREAM} />
      <circle cx="128" cy="80" r="9" fill={DARK} />
      <circle cx="128" cy="80" r="3" fill={CREAM} />
      <path d="M18 89h144" stroke={DARK} strokeWidth="2.6" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

export function Speedboat() {
  return (
    <svg className="place-art" viewBox="0 0 180 100" fill="none" aria-hidden="true">
      {/* The bow is at the left, so the wake trails off the stern on the right. */}
      <path d="M150 74c10-5 20-5 28 0M154 64c8-4 15-4 22 0" stroke={CREAM} strokeWidth="2.4" strokeLinecap="round" opacity=".5" />
      {/* raked windscreen, sitting on the deck rather than floating over it */}
      <path d="M74 52c1-9 8-14 17-15l3 15z" fill={CREAM} />
      {/* outboard on the transom */}
      <path d="M142 40h8v15h-8z" fill={DARK} />
      <path d="M146 55v8" stroke={DARK} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M140 64h12" stroke={DARK} strokeWidth="3.2" strokeLinecap="round" />
      {/* hull: raked bow at the left, flat transom at the right */}
      <path d="M26 54c10-4 22-6 36-6h80v10l-8 18H54c-14 0-24-9-28-22Z" fill={DARK} />
      <path d="M30 52c10-3 21-4 32-4h80" stroke={RUST} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M66 62h54" stroke={CREAM} strokeWidth="3" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}
