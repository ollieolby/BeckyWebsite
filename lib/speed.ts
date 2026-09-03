// Smoothing the speed reading.
//
// A boat under way holds a very steady speed, so nearly all the jitter in a
// GPS reading is the GPS rather than the boat. A short rolling mean settles
// the number without hiding a real change: at 8 km/h a 20 second window still
// reacts inside about 45 metres of travel.

export type SpeedSample = { kmh: number; at: number };

export const SPEED_WINDOW_MS = 20000;

/** Add a reading and drop anything that has aged out of the window. */
export function pushSample(samples: SpeedSample[], kmh: number, at: number, windowMs = SPEED_WINDOW_MS): SpeedSample[] {
  return [...samples, { kmh, at }].filter(sample => at - sample.at <= windowMs);
}

/** The mean of the window, or null when there is nothing recent to average. */
export function smoothed(samples: SpeedSample[], now: number, windowMs = SPEED_WINDOW_MS): number | null {
  const live = samples.filter(sample => now - sample.at <= windowMs);
  if (!live.length) return null;
  return live.reduce((total, sample) => total + sample.kmh, 0) / live.length;
}

const R = 6371;
const toRad = (value: number) => (value * Math.PI) / 180;

/**
 * Speed worked out from two fixes, for devices that never populate
 * coords.speed. A boat at rest still wanders by several metres on GPS, so a
 * move smaller than the reported accuracy is treated as noise and not as
 * movement - otherwise a moored boat shows a knot or two of phantom way.
 */
export function derivedSpeedKmh(
  previous: { lat: number; lng: number; at: number; accuracy: number },
  next: { lat: number; lng: number; at: number; accuracy: number },
): number | null {
  const seconds = (next.at - previous.at) / 1000;
  if (seconds <= 0.5) return null;

  const dLat = toRad(next.lat - previous.lat);
  const dLng = toRad(next.lng - previous.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(previous.lat)) * Math.cos(toRad(next.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));

  const noiseKm = Math.max(previous.accuracy, next.accuracy, 5) / 1000;
  if (km < noiseKm) return 0;
  return (km / seconds) * 3600;
}
