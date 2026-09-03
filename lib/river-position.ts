import { THAMES_LOCKS } from './thames-locks.ts';

// Where you are between two locks, and how far it is to each.
//
// There is no centreline for the river here, only the 45 lock positions and
// the Environment Agency's distance for each reach. Measuring straight from
// a boat to a lock would understate it badly - the Thames meanders enough
// that two miles of water can be one mile of air. So the reach you are on is
// identified first, and its real length is split between the two ends. The
// total is the EA's; only the split is estimated.

export type LockFix = {
  name: string;
  km: number;
  direction: 'upstream' | 'downstream';
  lat: number;
  lng: number;
};

const LOCKS = THAMES_LOCKS;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * The lock immediately upstream and the one immediately downstream, with the
 * distance by water to each. Returns null when the position is nowhere near
 * the navigation - there is nothing useful to say about a boat in Birmingham.
 */
export function locksEitherSide(lat: number, lng: number): { upstream: LockFix | null; downstream: LockFix | null } | null {
  let best = -1;
  let bestSum = Infinity;
  for (let i = 0; i < LOCKS.length - 1; i++) {
    const sum = haversineKm(lat, lng, LOCKS[i].lat, LOCKS[i].lng)
      + haversineKm(lat, lng, LOCKS[i + 1].lat, LOCKS[i + 1].lng);
    if (sum < bestSum) { bestSum = sum; best = i; }
  }
  if (best < 0) return null;

  const upper = LOCKS[best];
  const lower = LOCKS[best + 1];
  const reachKm = upper.kmToNext;
  const toUpper = haversineKm(lat, lng, upper.lat, upper.lng);
  const toLower = haversineKm(lat, lng, lower.lat, lower.lng);

  // Well off the water: the nearest reach is still miles away.
  if (Math.min(toUpper, toLower) > 12) return null;

  const share = toUpper + toLower;
  const fraction = share > 0 ? toUpper / share : 0.5;

  // The list runs downstream, so the earlier entry is upstream of you.
  return {
    upstream: upper.name.includes('Lock')
      ? { name: upper.name, km: reachKm * fraction, direction: 'upstream', lat: upper.lat, lng: upper.lng }
      : null,
    downstream: lower.name.includes('Lock')
      ? { name: lower.name, km: reachKm * (1 - fraction), direction: 'downstream', lat: lower.lat, lng: lower.lng }
      : null,
  };
}

/** Minutes at the given speed, or at the 8 km/h limit when none is reported. */
export function minutesFor(km: number, speedKmh: number | null) {
  const speed = speedKmh && speedKmh > 1 ? speedKmh : 8;
  return (km / speed) * 60;
}

export type RiverFix = {
  /** Index into THAMES_LOCKS of the entry immediately upstream. */
  reachIndex: number;
  /** How far along that reach you are: 0 at its head, 1 at its foot. */
  fraction: number;
  reachKm: number;
  upstream: LockFix | null;
  downstream: LockFix | null;
};

/** The same fix as locksEitherSide, keeping the reach so a route can be built. */
export function fixOnRiver(lat: number, lng: number): RiverFix | null {
  let best = -1;
  let bestSum = Infinity;
  for (let i = 0; i < LOCKS.length - 1; i++) {
    const sum = haversineKm(lat, lng, LOCKS[i].lat, LOCKS[i].lng)
      + haversineKm(lat, lng, LOCKS[i + 1].lat, LOCKS[i + 1].lng);
    if (sum < bestSum) { bestSum = sum; best = i; }
  }
  if (best < 0) return null;

  const upper = LOCKS[best];
  const lower = LOCKS[best + 1];
  const toUpper = haversineKm(lat, lng, upper.lat, upper.lng);
  const toLower = haversineKm(lat, lng, lower.lat, lower.lng);
  if (Math.min(toUpper, toLower) > 12) return null;

  const share = toUpper + toLower;
  const fraction = share > 0 ? toUpper / share : 0.5;
  const reachKm = upper.kmToNext;

  return {
    reachIndex: best,
    fraction,
    reachKm,
    upstream: upper.name.includes('Lock')
      ? { name: upper.name, km: reachKm * fraction, direction: 'upstream', lat: upper.lat, lng: upper.lng }
      : null,
    downstream: lower.name.includes('Lock')
      ? { name: lower.name, km: reachKm * (1 - fraction), direction: 'downstream', lat: lower.lat, lng: lower.lng }
      : null,
  };
}

export type Route = { km: number; locksPassed: number };

/**
 * Distance to any lock in one direction, and how many others you pass through
 * to reach it. Only the leg to the first lock is estimated - the rest are the
 * Environment Agency's own reach lengths, added up.
 */
export function routeTo(fix: RiverFix, targetIndex: number): Route | null {
  const { reachIndex: i, fraction: f, reachKm } = fix;
  if (targetIndex > i) {
    // Downstream. The destination itself is not counted as passed through.
    let km = (1 - f) * reachKm;
    for (let j = i + 1; j < targetIndex; j++) km += LOCKS[j].kmToNext;
    return { km, locksPassed: Math.max(0, targetIndex - i - 1) };
  }
  if (targetIndex <= i) {
    let km = f * reachKm;
    for (let j = targetIndex; j < i; j++) km += LOCKS[j].kmToNext;
    return { km, locksPassed: Math.max(0, i - targetIndex) };
  }
  return null;
}

/** Locks ahead of you in one direction, nearest first. */
export function locksAhead(fix: RiverFix, direction: 'upstream' | 'downstream') {
  const out: { index: number; name: string; lat: number; lng: number }[] = [];
  if (direction === 'downstream') {
    for (let j = fix.reachIndex + 1; j < LOCKS.length; j++) {
      if (LOCKS[j].name.includes('Lock')) out.push({ index: j, name: LOCKS[j].name, lat: LOCKS[j].lat, lng: LOCKS[j].lng });
    }
  } else {
    for (let j = fix.reachIndex; j >= 0; j--) {
      if (LOCKS[j].name.includes('Lock')) out.push({ index: j, name: LOCKS[j].name, lat: LOCKS[j].lat, lng: LOCKS[j].lng });
    }
  }
  return out;
}

export const MINUTES_IN_LOCK = 15;
