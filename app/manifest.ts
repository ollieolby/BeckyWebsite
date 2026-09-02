import type { MetadataRoute } from 'next';

// Lets iOS and Android treat the site as an app when it is added to the Home
// Screen, rather than a bookmark with a screenshot for an icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Becky — the boat guide',
    short_name: 'Becky',
    description: 'The shared guide to Becky, Cormorant and Drakar.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4efe3',
    theme_color: '#0c3340',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      // Android crops to its own shape, so the same art is offered as
      // maskable: it is full bleed with the letter well inside the safe area.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
