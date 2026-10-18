// backend/src/services/geocode.service.ts
// Resolve free text ("Red Fort", "Lunch in Shillong", "13.08, 80.27") to
// coordinates. Tries offline sources first, then Nominatim if reachable.

import SafetyScore from "../models/SafetyScore";
import { isValidLatLng } from "../recommend/geo";
import { escapeRegExp, geocodeOffline, type GeoResult } from "../recommend/geocodeOffline";

export { geocodeOffline, type GeoResult } from "../recommend/geocodeOffline";

const NOMINATIM_ENABLED = String(process.env.ENABLE_GEOCODER ?? "true").toLowerCase() !== "false";
const NOMINATIM_URL = process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org/search";
const cache = new Map<string, GeoResult | null>();
let pausedUntil = 0;

async function geocodeArea(q: string): Promise<GeoResult | null> {
  try {
    const first = q.split(",")[0]?.trim();
    if (!first || first.length < 3) return null;
    const doc: any = await SafetyScore.findOne({ name: { $regex: `^${escapeRegExp(first)}`, $options: "i" } }).lean();
    const c = doc?.loc?.coordinates;
    if (Array.isArray(c) && c.length === 2) return { lat: Number(c[1]), lng: Number(c[0]), label: doc.name, source: "area" };
  } catch {
    /* ignore */
  }
  return null;
}

async function geocodeNominatim(q: string): Promise<GeoResult | null> {
  if (!NOMINATIM_ENABLED || Date.now() < pausedUntil) return null;
  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=${encodeURIComponent(process.env.GEOCODER_COUNTRIES || "in")}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "TourSecure/1.0 (tourist safety app)", Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr: any = await res.json();
    const hit = Array.isArray(arr) ? arr[0] : null;
    if (hit && isValidLatLng(hit.lat, hit.lon)) {
      return { lat: Number(hit.lat), lng: Number(hit.lon), label: String(hit.display_name || q).split(",").slice(0, 3).join(","), source: "nominatim" };
    }
    return null;
  } catch (e: any) {
    pausedUntil = Date.now() + 10 * 60_000;
    console.warn("Nominatim geocoder unavailable:", e?.message || e);
    return null;
  }
}

export async function geocode(q: string): Promise<GeoResult | null> {
  const key = String(q || "").trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  const r = geocodeOffline(q) ?? (await geocodeArea(q)) ?? (await geocodeNominatim(q));
  cache.set(key, r);
  if (cache.size > 1000) cache.delete(cache.keys().next().value as string);
  return r;
}
