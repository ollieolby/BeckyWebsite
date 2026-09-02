import type { Metadata, Viewport } from 'next';
import './globals.css';
import './admin.css';
import './ask-becky.css';
import './login.css';
import './add-information.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './places-map.css';
import './publishing.css';
import './content-manager.css';
import './chat.css';
import './asset.css';
import './notes.css';
import './mobile.css';

export const metadata: Metadata = {
  title: 'Becky — The boat guide',
  description: 'The shared guide to Becky, Cormorant and Drakar.',
  manifest: '/manifest.webmanifest',
  icons: {
    // The .ico is still asked for by name by some browsers, and an SVG alone
    // left them with nothing. iOS ignores SVG favicons altogether, so the
    // Home Screen needs its own opaque square PNG.
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
    ],
    shortcut: '/favicon.ico',
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  appleWebApp: {
    capable: true,
    title: 'Becky',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#0c3340',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
