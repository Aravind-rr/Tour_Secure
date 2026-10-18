// backend/src/recommend/geo.ts
// Small, dependency-free geo helpers.

export type LatLng = { lat: number; lng: number };

const R_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
}

/** Ray-casting point-in-polygon for a GeoJSON ring of [lng, lat] pairs. */
export function pointInRing(pt: LatLng, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    const intersect =
      yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** GeoJSON Polygon containment (outer ring minus holes). */
export function pointInPolygon(pt: LatLng, coordinates: number[][][]): boolean {
  if (!Array.isArray(coordinates) || !coordinates.length) return false;
  const [outer, ...holes] = coordinates;
  if (!outer || !pointInRing(pt, outer)) return false;
  return !holes.some((h) => pointInRing(pt, h));
}

/** Rough road distance from straight-line distance (detour factor). */
export function roadKm(straightKm: number): number {
  return straightKm * 1.3;
}

/** Rough urban travel time in minutes (avg ~22 km/h incl. traffic), min 5. */
export function travelMinutes(straightKm: number): number {
  if (straightKm < 0.05) return 0;
  return Math.max(5, Math.round((roadKm(straightKm) / 22) * 60));
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
