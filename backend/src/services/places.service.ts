// backend/src/services/places.service.ts
// Candidate places = curated catalogue + (optionally) live OpenStreetMap POIs
// via the Overpass API. OSM is best-effort: short timeout, cached, and
// automatically paused after a failure so it never slows the app down.

import { categoryFromOsmTags, type CategoryId } from "../recommend/categories";
import { CURATED_PLACES, type BestTime, type Place } from "../recommend/places.data";
import { haversineKm, type LatLng } from "../recommend/geo";
import { computeSafety } from "../recommend/safety";
import { sameName, type Candidate } from "../recommend/engine";
import { getSafetySnapshot } from "./safetyLookup.service";

const OSM_ENABLED = String(process.env.ENABLE_OSM ?? "true").toLowerCase() !== "false";
const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const OSM_TIMEOUT_MS = Number(process.env.OSM_TIMEOUT_MS || 6000);
const OSM_MAX_RADIUS_KM = 8;
const CACHE_TTL_MS = 30 * 60_000;
const BREAKER_MS = 10 * 60_000;

const osmCache = new Map<string, { at: number; places: Place[] }>();
let osmPausedUntil = 0;

const DEFAULTS: Record<CategoryId, { mins: number; best: BestTime; indoor: boolean }> = {
  historic: { mins: 90, best: "morning", indoor: false },
  entertainment: { mins: 120, best: "evening", indoor: true },
  fun: { mins: 150, best: "afternoon", indoor: false },
  food: { mins: 60, best: "any", indoor: true },
  nature: { mins: 75, best: "morning", indoor: false },
  spiritual: { mins: 45, best: "morning", indoor: false },
  shopping: { mins: 90, best: "evening", indoor: false },
};

function buildOverpassQuery(o: LatLng, radiusM: number): string {
  const a = `around:${Math.round(radiusM)},${o.lat},${o.lng}`;
  return `[out:json][timeout:${Math.ceil(OSM_TIMEOUT_MS / 1000)}];
(
  nwr(${a})["tourism"~"^(museum|attraction|theme_park|zoo|aquarium|viewpoint|gallery)$"]["name"];
  nwr(${a})["historic"~"^(monument|castle|fort|memorial|archaeological_site|ruins|palace|temple)$"]["name"];
  nwr(${a})["amenity"~"^(restaurant|cafe|cinema|theatre|arts_centre|nightclub|marketplace|place_of_worship|planetarium)$"]["name"];
  nwr(${a})["leisure"~"^(park|water_park|amusement_arcade|nature_reserve|garden)$"]["name"];
  nwr(${a})["shop"="mall"]["name"];
  nwr(${a})["natural"~"^(beach|waterfall|peak)$"]["name"];
);
out center tags 200;`;
}

function osmToPlace(el: any): Place | null {
  const tags: Record<string, string> = el?.tags ?? {};
  const name = tags["name:en"] || tags.name;
  const lat = Number(el.lat ?? el.center?.lat);
  const lng = Number(el.lon ?? el.center?.lon);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const category = categoryFromOsmTags(tags);
  if (!category) return null;

  let popularity = 35;
  if (tags.wikipedia || tags.wikidata) popularity += 25;
  if (tags.tourism === "attraction") popularity += 10;
  if (tags.heritage) popularity += 10;
  if (tags.website) popularity += 3;
  if (category === "food" && tags.cuisine) popularity += 3;

  const d = DEFAULTS[category];
  const also: CategoryId[] = [];
  if (category === "spiritual" && (tags.heritage || tags.historic)) also.push("historic");
  if (category === "historic" && tags.amenity === "place_of_worship") also.push("spiritual");

  const descBits = [
    tags.cuisine ? `Cuisine: ${tags.cuisine.replace(/;/g, ", ")}` : "",
    tags.religion ? `Religion: ${tags.religion}` : "",
    tags.opening_hours ? `Hours: ${tags.opening_hours}` : "",
  ].filter(Boolean);

  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    city: tags["addr:city"] || "",
    lat,
    lng,
    category,
    also,
    popularity: Math.min(80, popularity),
    durationMins: d.mins,
    bestTime: d.best,
    price: 1,
    indoor: tags.amenity === "cinema" || tags.amenity === "theatre" || tags.tourism === "museum" ? true : d.indoor,
    tags: [tags.tourism, tags.historic, tags.amenity, tags.leisure].filter(Boolean) as string[],
    description: descBits.join(" · ") || "From OpenStreetMap",
    source: "osm",
  };
}

async function fetchOsm(origin: LatLng, radiusKm: number): Promise<Place[]> {
  if (!OSM_ENABLED || Date.now() < osmPausedUntil) return [];
  const r = Math.min(radiusKm, OSM_MAX_RADIUS_KM);
  const key = `${origin.lat.toFixed(2)},${origin.lng.toFixed(2)},${Math.round(r)}`;
  const hit = osmCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.places;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TourSecure/1.0" },
      body: `data=${encodeURIComponent(buildOverpassQuery(origin, r * 1000))}`,
      signal: AbortSignal.timeout(OSM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const json: any = await res.json();
    const places = (Array.isArray(json?.elements) ? json.elements : [])
      .map(osmToPlace)
      .filter((p: Place | null): p is Place => !!p);
    // keep it manageable: restaurants are plentiful, cap per category
    const capped = capPerCategory(places, 25);
    osmCache.set(key, { at: Date.now(), places: capped });
    if (osmCache.size > 200) osmCache.delete(osmCache.keys().next().value as string);
    return capped;
  } catch (e: any) {
    osmPausedUntil = Date.now() + BREAKER_MS;
    console.warn(`OSM lookup unavailable (${e?.message || e}); using curated places for ${BREAKER_MS / 60000} min`);
    return [];
  }
}

function capPerCategory(places: Place[], n: number): Place[] {
  const count: Partial<Record<CategoryId, number>> = {};
  return places
    .sort((a, b) => b.popularity - a.popularity)
    .filter((p) => {
      count[p.category] = (count[p.category] ?? 0) + 1;
      return (count[p.category] ?? 0) <= n;
    });
}

/** Merge curated + OSM, dropping OSM duplicates of curated places. */
function merge(curated: Place[], osm: Place[]): Place[] {
  const out = [...curated];
  for (const p of osm) {
    const dup = curated.some((c) => {
      const d = haversineKm(c, p);
      return d < 0.08 || (d < 0.6 && sameName(c.name, p.name));
    });
    if (!dup) out.push(p);
  }
  return out;
}

export type CandidateResult = { candidates: Candidate[]; sources: string[] };

export async function getCandidates(origin: LatLng, radiusKm: number, hour?: number): Promise<CandidateResult> {
  const curated = CURATED_PLACES.filter((p) => haversineKm(origin, p) <= radiusKm);
  const osm = await fetchOsm(origin, radiusKm);
  const snap = await getSafetySnapshot();
  const all = merge(curated, osm);
  const candidates: Candidate[] = all.map((p) => ({
    ...p,
    distanceKm: haversineKm(origin, p),
    safety: computeSafety(snap, p, hour),
  }));
  const sources = ["curated", ...(osm.length ? ["openstreetmap"] : [])];
  return { candidates, sources };
}

/** Nearest curated hub (city) to a point — useful for "no places nearby" hints. */
export function nearestCuratedCity(origin: LatLng): { city: string; distanceKm: number } | null {
  let best: { city: string; distanceKm: number } | null = null;
  for (const p of CURATED_PLACES) {
    const d = haversineKm(origin, p);
    if (!best || d < best.distanceKm) best = { city: p.city, distanceKm: d };
  }
  return best;
}
