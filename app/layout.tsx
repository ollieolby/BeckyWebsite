import type { Metadata } from 'next';
import './globals.css';
import './admin.css';

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
