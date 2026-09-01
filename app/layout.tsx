import type { Metadata } from 'next';
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
