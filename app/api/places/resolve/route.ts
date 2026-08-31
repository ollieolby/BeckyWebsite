import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/server';

const allowedHosts = new Set(['maps.app.goo.gl','goo.gl','www.google.com','google.com','maps.google.com']);

export async function POST(request: Request) {
  try {
    await requireUser();
    const { url: input } = await request.json();
    const initial = new URL(String(input));
    if (initial.protocol !== 'https:' || !allowedHosts.has(initial.hostname)) {
      return NextResponse.json({ error: 'Enter a valid Google Maps sharing link.' }, { status: 400 });
    }

    let resolved = initial;
    if (initial.hostname === 'maps.app.goo.gl' || initial.hostname === 'goo.gl') {
      const response = await fetch(initial, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      resolved = new URL(response.url);
      if (!allowedHosts.has(resolved.hostname)) throw new Error('Unexpected redirect from Google Maps.');
    }

    const decoded = decodeURIComponent(resolved.toString());
    const at = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    const markers = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const place = resolved.pathname.match(/\/maps\/place\/([^/]+)/) || resolved.pathname.match(/\/place\/([^/]+)/);
    // Google place URLs often contain both the camera centre (@lat,lng) and
    // the actual place marker (!3dlat!4dlng). Always prefer the marker.
    const latitude = Number(markers?.[1] ?? at?.[1]);
    const longitude = Number(markers?.[2] ?? at?.[2]);
    const name = place?.[1]?.replace(/\+/g, ' ').trim() ?? '';

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ url: resolved.toString(), name, error: 'The link resolved, but Google did not include coordinates. Add them manually below.' }, { status: 422 });
    }
    return NextResponse.json({ url: resolved.toString(), name, latitude, longitude });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read that Maps link.' }, { status: 400 });
  }
}
