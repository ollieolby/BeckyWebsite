import { Suspense } from 'react';
import type { Metadata } from 'next';
import Chat from './chat';

export const metadata: Metadata = { title: 'Ask Becky — The boat guide' };

export default function ChatPage() {
  return <Suspense fallback={null}><Chat /></Suspense>;
}
