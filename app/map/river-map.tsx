'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import * as maplibregl from 'maplibre-gl';
import { THAMES_LOCKS } from '@/lib/thames-locks';
import { CATEGORY_COLOURS, CATEGORY_LABELS, CATEGORY_ICONS, markerElement } from './marker-icons';

type Place = {
  id: string; name: string; category: string;
  latitude: number; longitude: number; notes: string;
  google_maps_url: string | null;
};

const ORDER = ['mooring', 'pub', 'cafe', 'shop', 'fuel', 'other'];
const HOME: [number, number] = [-0.733883, 51.574538];
const HOME_UPSTREAM = 'Marlow Lock';
const HOME_DOWNSTREAM = 'Cookham Lock';

const LOCKS = THAMES_LOCKS.filter(lock => lock.name.includes('Lock'));

function duration(minutes: number) {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// Cruising time from the home reach to each lock, walking the table outwards
// in both directions. The times are the Environment Agency's own reach
// timings at the 8 km/h limit, plus the family's 15 minutes a lock.
const MINUTES_PER_LOCK = 15;
// Computed once at module load: it reads only the static lock table.
function computeTimesFromHome() {
  const times = new Map<string, { minutes: number; locks: number; direction: 'upstream' | 'downstream' }>();
  const upstreamIndex = THAMES_LOCKS.findIndex(lock => lock.name === HOME_UPSTREAM);
  const downstreamIndex = THAMES_LOCKS.findIndex(lock => lock.name === HOME_DOWNSTREAM);
  if (upstreamIndex < 0 || downstreamIndex < 0) return times;

  // Downstream: home sits partway along Marlow's reach.
  let minutes = THAMES_LOCKS[upstreamIndex].minutesToNext * 0.55;
  for (let i = downstreamIndex; i < THAMES_LOCKS.length; i++) {
    minutes += MINUTES_PER_LOCK;
    times.set(THAMES_LOCKS[i].name, { minutes, locks: i - downstreamIndex + 1, direction: 'downstream' });
    minutes += THAMES_LOCKS[i].minutesToNext;
  }
  // Upstream: the rest of Marlow's reach, then back up the table.
  minutes = THAMES_LOCKS[upstreamIndex].minutesToNext * 0.45;
  for (let i = upstreamIndex; i >= 0; i--) {
    minutes += MINUTES_PER_LOCK;
    times.set(THAMES_LOCKS[i].name, { minutes, locks: upstreamIndex - i + 1, direction: 'upstream' });
    if (i > 0) minutes += THAMES_LOCKS[i - 1].minutesToNext;
  }
  return times;
}
const FROM_HOME = computeTimesFromHome();
// Nearest first: the family's own locks are the ones they look up, and a list
// that opens 25 hours upstream at Lechlade is a list nobody scrolls.
const locks = [...LOCKS].sort((a, b) =>
  (FROM_HOME.get(a.name)?.minutes ?? Infinity) - (FROM_HOME.get(b.name)?.minutes ?? Infinity));


// Kept out of the effect so the failure path above reads clearly.
function buildMap(container: HTMLDivElement) {
  return new maplibregl.Map({
    container,
    center: HOME,
    zoom: 12,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
  });
}


// "Back to the home mooring", built as a MapLibre control so it stacks with
// the zoom and locate buttons instead of floating in the opposite corner.
class HomeControl implements maplibregl.IControl {
  private node?: HTMLDivElement;

  onAdd(map: maplibregl.Map) {
    const node = document.createElement('div');
    node.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Back to the home mooring';
    button.setAttribute('aria-label', 'Back to the home mooring');
    button.className = 'map-home-button';
    button.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
      stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${CATEGORY_ICONS.home}</svg>`;
    button.addEventListener('click', () => map.flyTo({ center: HOME, zoom: 13, duration: 900 }));
    node.appendChild(button);
    this.node = node;
    return node;
  }

  onRemove() {
    this.node?.remove();
  }
}

export default function RiverMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [mapProblem, setMapProblem] = useState<string | null>(null);
  const [showLocks, setShowLocks] = useState(true);
  const [query, setQuery] = useState('');


  useEffect(() => {
    let cancelled = false;
    fetch('/api/places')
      .then(response => (response.ok ? response.json() : Promise.reject(new Error('unavailable'))))
      .then((data: Place[]) => { if (!cancelled) setPlaces(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!container.current || !places || mapRef.current) return;

    // MapLibre 5 and later need WebGL2, and a browser without it throws here.
    // Left unhandled that is a silent grey rectangle, so catch it and say so
    // rather than leaving the reader wondering. Deferred out of the effect
    // body so it does not cascade a second render.
    let map: maplibregl.Map;
    try {
      map = buildMap(container.current);
    } catch (error) {
      console.error('[river map] could not start', error);
      queueMicrotask(() => setMapProblem(
        'This browser could not draw the map. The list of places still works, and each one opens in Google Maps.',
      ));
      return;
    }

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // Where the reader is, if they let the browser say. Needs https, which
    // the deployed site has; on http it simply never offers.
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: true,
    }), 'top-right');
    map.addControl(new HomeControl(), 'top-right');
    map.on('error', event => {
      console.error('[river map]', event.error?.message ?? event);
    });

    // A map created before its container has a height stays blank for ever;
    // Safari resolves the height of a sticky, absolutely positioned box on a
    // later pass than Chrome does, so tell the map whenever the box changes.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);

    const popup = (kind: string, name: string, lines: string[] = [], link?: string | null) => {
      const node = document.createElement('div');
      node.className = 'place-popup';
      const small = document.createElement('small'); small.textContent = kind;
      const strong = document.createElement('strong'); strong.textContent = name;
      node.append(small, strong);
      for (const line of lines) { const p = document.createElement('p'); p.textContent = line; node.append(p); }
      if (link) {
        const a = document.createElement('a');
        a.href = link; a.target = '_blank'; a.rel = 'noreferrer'; a.textContent = 'Open in Google Maps ↗';
        node.append(a);
      }
      return new maplibregl.Popup({ offset: 30 }).setDOMContent(node);
    };

    new maplibregl.Marker({ element: markerElement('home') })
      .setLngLat(HOME)
      .setPopup(popup('Home mooring', 'Becky', ['Between Marlow Lock and Cookham Lock, near Bourne End.']))
      .addTo(map);

    for (const lock of locks) {
      const time = FROM_HOME.get(lock.name);
      const lines = time
        ? [`About ${duration(time.minutes)} from home, ${time.direction}, through ${time.locks} lock${time.locks === 1 ? '' : 's'}.`]
        : [];
      markers.current[`lock:${lock.name}`] = new maplibregl.Marker({ element: markerElement('lock', { small: true }) })
        .setLngLat([lock.lng, lock.lat])
        .setPopup(popup('Lock', lock.name, lines))
        .addTo(map);
    }

    for (const place of places) {
      markers.current[place.id] = new maplibregl.Marker({ element: markerElement(place.category) })
        .setLngLat([place.longitude, place.latitude])
        .setPopup(popup(CATEGORY_LABELS[place.category] ?? place.category, place.name, place.notes ? [place.notes] : [], place.google_maps_url))
        .addTo(map);
    }

    const bounds = new maplibregl.LngLatBounds(HOME, HOME);
    for (const place of places) bounds.extend([place.longitude, place.latitude]);
    if (places.length) map.fitBounds(bounds, { padding: 80, maxZoom: 13.5, duration: 0 });
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; markers.current = {}; };
  }, [places]);

  // Locks are useful but there are 44 of them; off by default on a small map
  // would hide the point, so they are on with a switch rather than buried.
  useEffect(() => {
    for (const [key, marker] of Object.entries(markers.current)) {
      if (!key.startsWith('lock:')) continue;
      marker.getElement().style.display = showLocks ? '' : 'none';
    }
  }, [showLocks, places]);

  function show(lng: number, lat: number, key: string) {
    setActive(key);
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, duration: 900 });
    markers.current[key]?.togglePopup();
  }

  const search = query.trim().toLowerCase();
  const grouped = useMemo(() => {
    const byCategory = new Map<string, Place[]>();
    for (const place of places ?? []) {
      if (search && !`${place.name} ${place.notes} ${CATEGORY_LABELS[place.category] ?? ''}`.toLowerCase().includes(search)) continue;
      const list = byCategory.get(place.category) ?? [];
      list.push(place);
      byCategory.set(place.category, list);
    }
    return ORDER.filter(key => byCategory.has(key))
      .map(key => [key, byCategory.get(key)!.sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [places, search]);

  const matchingLocks = useMemo(
    () => (search ? locks.filter(lock => lock.name.toLowerCase().includes(search)) : []),
    [search],
  );
  const shown = grouped.reduce((n, [, items]) => n + items.length, 0);

  return (
    <div className="river-map">
      <div className="river-map-canvas">
        <div ref={container} className="map-surface" aria-label="Map of the family's saved places and the Thames locks" />
        {mapProblem && <p className="map-unavailable">{mapProblem}</p>}

        <div className="map-legend">
          {['mooring', 'pub', 'cafe', 'shop', 'fuel'].map(key => (
            <span key={key}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={CATEGORY_COLOURS[key]}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                dangerouslySetInnerHTML={{ __html: CATEGORY_ICONS[key] }} />
              {CATEGORY_LABELS[key]}
            </span>
          ))}
          <label className="map-legend-toggle">
            <input type="checkbox" checked={showLocks} onChange={event => setShowLocks(event.target.checked)} />
            Locks
          </label>
        </div>
      </div>

      <aside className="river-map-list">
        <input
          className="river-map-search" type="search" value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search places and locks…" aria-label="Search places and locks"
        />

        {failed && <p className="river-map-note">The places could not be loaded just now. Try again in a moment.</p>}
        {!failed && places === null && <p className="river-map-note">Loading our places…</p>}
        {!failed && places?.length === 0 && (
          <p className="river-map-note">
            Nothing saved yet beyond the home mooring. Add the first pub or mooring from <Link href="/add-information">Add information</Link>.
          </p>
        )}
        {!failed && !!places?.length && !shown && !matchingLocks.length && (
          <p className="river-map-note">Nothing matches “{query}”.</p>
        )}

        {grouped.map(([category, items]) => (
          <section key={category}>
            <h2><span className="dot" style={{ background: CATEGORY_COLOURS[category] }} />{CATEGORY_LABELS[category] ?? category}</h2>
            <ul>
              {items.map(place => (
                <li key={place.id} className={active === place.id ? 'active' : ''}>
                  <button type="button" onClick={() => show(place.longitude, place.latitude, place.id)}>
                    <strong>{place.name}</strong>
                    {place.notes && <small>{place.notes}</small>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2><span className="dot" style={{ background: CATEGORY_COLOURS.lock }} />Locks {search ? '' : `(${locks.length})`}</h2>
          <p className="river-map-note river-map-hint">Cruising time from the home reach at 8 km/h, allowing 15 minutes a lock. Conditions and queues change it.</p>
          <ul>
            {(search ? matchingLocks : locks).map(lock => {
              const time = FROM_HOME.get(lock.name);
              const key = `lock:${lock.name}`;
              return (
                <li key={lock.name} className={active === key ? 'active' : ''}>
                  <button type="button" onClick={() => show(lock.lng, lock.lat, key)}>
                    <strong>{lock.name.replace(' (to Teddington Boundary Obelisk)', '')}</strong>
                    {time && <small>{duration(time.minutes)} {time.direction} · {time.locks} lock{time.locks === 1 ? '' : 's'}</small>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </aside>
    </div>
  );
}
