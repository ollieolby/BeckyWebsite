// Marker glyphs, drawn on one 24-unit grid at one stroke weight.
//
// The map used plain coloured pins, which meant the legend was the only way to
// tell a pub from a fuel point. A shape is readable at a glance and survives
// being printed, screenshotted or looked at by someone who is colour blind.
export const CATEGORY_ICONS: Record<string, string> = {
  // tankard
  pub: '<path d="M7 7h8v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M15 10h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/><path d="M7 10h8"/>',
  // cup and saucer
  cafe: '<path d="M6 8h10v6a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M4 21h14"/>',
  // bollard and rope
  mooring: '<path d="M12 4a3 3 0 0 1 3 3v6H9V7a3 3 0 0 1 3-3z"/><path d="M6 13h12"/><path d="M7 17c3 2 7 2 10 0"/><path d="M7 20c3 2 7 2 10 0"/>',
  // fuel pump
  fuel: '<path d="M5 20V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v14"/><path d="M4 20h11"/><path d="M7 9h5"/><path d="M14 9h3a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0v-6l-2-2"/>',
  // shop awning
  shop: '<path d="M4 9h16l-1 11H5z"/><path d="M4 9l1.5-4h13L20 9"/><path d="M9 20v-6h6v6"/>',
  // waypoint
  other: '<path d="M12 21s6.5-6.2 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 14.8 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>',
  // a lock chamber with its gates
  lock: '<path d="M5 5v14M19 5v14"/><path d="M5 9h6M13 9h6"/><path d="M5 15h6M13 15h6"/><path d="M12 7v4M12 13v4"/>',
  // the home mooring: an anchor
  home: '<circle cx="12" cy="4.6" r="2"/><path d="M12 6.6V20"/><path d="M8.4 10h7.2"/><path d="M5.2 13.6c0 3.6 3 6.4 6.8 6.4s6.8-2.8 6.8-6.4"/>',
};

export const CATEGORY_COLOURS: Record<string, string> = {
  mooring: '#3d7e8a', pub: '#b55a3c', cafe: '#b18452',
  shop: '#71845e', fuel: '#725f87', other: '#687672',
  lock: '#8a8f86', home: '#123e47',
};

export const CATEGORY_LABELS: Record<string, string> = {
  mooring: 'Moorings', pub: 'Pubs', cafe: 'Cafés', shop: 'Shops',
  fuel: 'Fuel', other: 'Other stops', lock: 'Locks', home: 'Home mooring',
};

// A teardrop pin with the glyph knocked out of it, built as an element rather
// than an <img> so it inherits crisp rendering at any zoom.
export function markerElement(category: string, { small = false } = {}) {
  const colour = CATEGORY_COLOURS[category] ?? CATEGORY_COLOURS.other;
  const glyph = CATEGORY_ICONS[category] ?? CATEGORY_ICONS.other;
  const w = small ? 22 : 32;
  const h = small ? 28 : 40;
  const el = document.createElement('div');
  el.className = `map-pin${small ? ' map-pin-small' : ''}`;
  el.innerHTML = `
    <svg width="${w}" height="${h}" viewBox="0 0 32 40" aria-hidden="true">
      <path d="M16 39C16 39 30 24.5 30 15.5A14 14 0 0 0 2 15.5C2 24.5 16 39 16 39Z"
            fill="${colour}" stroke="rgba(255,255,255,.9)" stroke-width="1.6"/>
      <g transform="translate(6.4 5.6) scale(0.8)" fill="none" stroke="#fff"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
    </svg>`;
  return el;
}
