'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  fixOnRiver, routeTo, locksAhead, minutesFor, MINUTES_IN_LOCK,
  type RiverFix,
} from '@/lib/river-position';
import Link from 'next/link';
import { markerElement, CATEGORY_COLOURS } from '../map/marker-icons';
import { pushSample, smoothed, derivedSpeedKmh, type SpeedSample } from '@/lib/speed';

type Direction = 'upstream' | 'downstream';

function clock(minutes: number) {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} min`;
  return `${Math.floor(whole / 60)} h ${String(whole % 60).padStart(2, '0')}`;
}

function arrivalAt(minutes: number) {
  return new Date(Date.now() + minutes * 60000)
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

export default function Tracker() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const meRef = useRef<maplibregl.Marker | null>(null);
  const targetRef = useRef<maplibregl.Marker | null>(null);
  const watchRef = useRef<number | null>(null);
  // Where along the river we were last time, so the direction can be read
  // from movement rather than asked for.
  const lastAlong = useRef<number | null>(null);
  const centred = useRef(false);
  const samples = useRef<SpeedSample[]>([]);
  const lastPos = useRef<{ lat: number; lng: number; at: number; accuracy: number } | null>(null);

  const [tracking, setTracking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fix, setFix] = useState<RiverFix | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>('downstream');
  const [pinned, setPinned] = useState(false);          // user overrode the direction
  const [target, setTarget] = useState<number | null>(null);
  const [countLocks, setCountLocks] = useState(true);

  // The saved places, as quiet dots. They are context while under way, not
  // the subject of the page, so they get no pins, labels or popups.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/places')
      .then(response => (response.ok ? response.json() : []))
      .then((places: { id: string; latitude: number; longitude: number; name: string; category: string }[]) => {
        const map = mapRef.current;
        if (cancelled || !map) return;
        for (const place of places) {
          const dot = document.createElement('div');
          dot.className = 'tracker-dot';
          dot.style.background = CATEGORY_COLOURS[place.category] ?? CATEGORY_COLOURS.other;
          dot.title = place.name;
          new maplibregl.Marker({ element: dot }).setLngLat([place.longitude, place.latitude]).addTo(map);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Once only: keyed on `tracking` this refetched and added a second dot
    // for every place the moment the reader pressed Start.
  }, []);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        center: [-0.733883, 51.574538],
        zoom: 13.5,
        style: {
          version: 8,
          sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
      });
    } catch {
      queueMicrotask(() => setProblem('This browser cannot draw the map.'));
      return;
    }
    mapRef.current = map;
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  const onPosition = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude, speed, accuracy } = position.coords;
    const at = position.timestamp || Date.now();
    setProblem(null);

    // Prefer what the device reports; work it out from two fixes when it
    // reports nothing, which some phones do throughout.
    const here = { lat: latitude, lng: longitude, at, accuracy: accuracy ?? 10 };
    const reading = typeof speed === 'number' && speed >= 0
      ? speed * 3.6
      : lastPos.current ? derivedSpeedKmh(lastPos.current, here) : null;
    lastPos.current = here;

    if (reading !== null) samples.current = pushSample(samples.current, reading, at);
    // A boat holds its speed, so the mean of the last few seconds is a truer
    // reading than the last sample on its own.
    setSpeedKmh(smoothed(samples.current, at));

    const next = fixOnRiver(latitude, longitude);
    setFix(next);

    const map = mapRef.current;
    if (map) {
      if (!meRef.current) meRef.current = new maplibregl.Marker({ element: markerElement('home') }).setLngLat([longitude, latitude]).addTo(map);
      else meRef.current.setLngLat([longitude, latitude]);
      if (!centred.current) {
        // Snap to a useful scale on the first fix. The map is built before
        // its container has a height, so the zoom it starts with cannot be
        // relied on; after this the reader's own pinching is left alone.
        map.jumpTo({ center: [longitude, latitude], zoom: 14.5 });
        centred.current = true;
      } else {
        map.easeTo({ center: [longitude, latitude], duration: 700 });
      }
    }

    if (!next) return;
    // Position along the river as one increasing number, so which way the
    // boat is going falls out of two readings.
    const along = next.reachIndex + next.fraction;
    const previous = lastAlong.current;
    if (previous !== null && !pinned) {
      const moved = along - previous;
      if (Math.abs(moved) > 0.02) setDirection(moved > 0 ? 'downstream' : 'upstream');
    }
    lastAlong.current = along;
  }, [pinned]);

  function start() {
    if (!('geolocation' in navigator)) return setProblem('This browser cannot report your position.');
    setTracking(true);
    setProblem('Waiting for a position…');
    watchRef.current = navigator.geolocation.watchPosition(
      onPosition,
      () => setProblem('Position lost for a moment — showing the last reading.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }

  function stop() {
    centred.current = false;
    samples.current = [];
    lastPos.current = null;
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setTracking(false);
  }

  useEffect(() => () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); }, []);

  const ahead = useMemo(() => (fix ? locksAhead(fix, direction) : []), [fix, direction]);
  // Derived rather than corrected in an effect: with nothing chosen, or a
  // choice that is now behind us, the next lock along is the answer.
  const activeTarget = target !== null && ahead.some(lock => lock.index === target)
    ? target
    : ahead[0]?.index ?? null;

  const route = fix && activeTarget !== null ? routeTo(fix, activeTarget) : null;
  const targetLock = ahead.find(lock => lock.index === activeTarget) ?? null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !targetLock) return;
    // setLngLat before addTo: addTo reads the position straight away and
    // throws on a marker that has not been given one.
    if (!targetRef.current) {
      targetRef.current = new maplibregl.Marker({ element: markerElement('lock', { small: true }) })
        .setLngLat([targetLock.lng, targetLock.lat])
        .addTo(map);
      return;
    }
    targetRef.current.setLngLat([targetLock.lng, targetLock.lat]);
  }, [targetLock]);
  const usingLimit = !speedKmh || speedKmh <= 1;
  const minutes = route
    ? minutesFor(route.km, usingLimit ? null : speedKmh) + (countLocks ? route.locksPassed * MINUTES_IN_LOCK : 0)
    : null;

  return (
    <div className={`tracker${tracking ? ' is-tracking' : ''}`}>
      <header className="tracker-bar">
        <Link href="/map" className="tracker-back" aria-label="Back to the river map">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          <span>Map</span>
        </Link>
        <strong>Track me</strong>
        {tracking
          ? <button type="button" className="tracker-barstop" onClick={stop}>Stop</button>
          : <span className="tracker-barspace" />}
      </header>
      <div className="tracker-map"><div ref={container} className="map-surface" aria-label="Your position on the river" /></div>

      {!tracking ? (
        <div className="tracker-start">
          <h1>Track me</h1>
          <p>Your speed over the ground, and how long to the next lock, while you are under way.</p>
          <button type="button" onClick={start}>Start tracking</button>
          {problem && <p className="tracker-note">{problem}</p>}
        </div>
      ) : (
        <div className="tracker-panel">
          <div className="tracker-speed">
            <strong>{speedKmh && speedKmh > 1 ? speedKmh.toFixed(1) : '—'}</strong>
            <span>km/h{usingLimit && ' · timing at the 8 limit'}</span>
          </div>

          <div className="tracker-controls">
            <label>
              Heading
              <select
                value={direction}
                onChange={event => { setDirection(event.target.value as Direction); setPinned(true); }}
              >
                <option value="upstream">Upstream</option>
                <option value="downstream">Downstream</option>
              </select>
            </label>
            <label>
              Lock
              <select value={activeTarget ?? ''} onChange={event => setTarget(Number(event.target.value))} disabled={!ahead.length}>
                {ahead.map(lock => (
                  <option key={lock.index} value={lock.index}>
                    {lock.name.replace(' (to Teddington Boundary Obelisk)', '')}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="tracker-eta">
            {route && minutes !== null ? (
              <>
                <strong>{clock(minutes)}</strong>
                <span>{route.km.toFixed(1)} km · arrive about {arrivalAt(minutes)}</span>
              </>
            ) : <span>{fix ? 'No lock that way.' : 'Not on the navigation.'}</span>}
          </div>

          <label className="tracker-check">
            <input type="checkbox" checked={countLocks} onChange={event => setCountLocks(event.target.checked)} />
            Add {MINUTES_IN_LOCK} min per lock on the way{route ? ` (${route.locksPassed})` : ''}
          </label>

          <p className="tracker-note">
            {fix && (
              <>Between {(fix.upstream?.name ?? 'the head of the river').replace(' (to Teddington Boundary Obelisk)', '')} and{' '}
              {(fix.downstream?.name ?? 'the tideway').replace(' (to Teddington Boundary Obelisk)', '')}. </>
            )}
            Distance to the first lock is estimated across the reach; the rest are Environment Agency figures. Queues not counted.
            {problem && <> {problem}</>}
          </p>

        </div>
      )}
    </div>
  );
}
