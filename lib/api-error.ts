import { NextResponse } from 'next/server';

export function apiError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 });
  }
  return NextResponse.json({ error: message || fallback }, { status: 500 });
}
