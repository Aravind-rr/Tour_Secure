// backend/src/recommend/geocodeOffline.ts
// Offline geocoding against the curated catalogue + known cities (pure).

import { CITIES, CURATED_PLACES } from "./places.data";
import { sameName } from "./engine";
import { isValidLatLng } from "./geo";

export type GeoResult = {
  lat: number;
  lng: number;
  label: string;
  source: "coordinates" | "place" | "city" | "area" | "nominatim";
};

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Offline-only resolution (pure; exported for tests). */
export function geocodeOffline(q: string): GeoResult | null {
  const text = String(q || "").trim();
  if (!text) return null;

  const m = text.match(/(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (m && isValidLatLng(m[1], m[2])) {
    return { lat: Number(m[1]), lng: Number(m[2]), label: `${Number(m[1]).toFixed(4)}, ${Number(m[2]).toFixed(4)}`, source: "coordinates" };
  }

  // A bare city name ("Shillong", "Bombay", "Jaipur, Rajasthan") means the city, not "Shillong Peak".
  const bare = text.toLowerCase().split(",")[0]!.trim();
  const exactCity = CITIES.find((c) => [c.name, ...(c.aliases ?? [])].some((n) => n.toLowerCase() === bare));
  if (exactCity) return { lat: exactCity.lat, lng: exactCity.lng, label: `${exactCity.name}, ${exactCity.state}`, source: "city" };

  const place = CURATED_PLACES.find((p) => sameName(p.name, text));
  if (place) return { lat: place.lat, lng: place.lng, label: `${place.name}, ${place.city}`, source: "place" };

  const lower = ` ${text.toLowerCase()} `;
  let city: (typeof CITIES)[number] | null = null;
  let len = 0;
  for (const c of CITIES) {
    for (const n of [c.name, ...(c.aliases ?? [])]) {
      const re = new RegExp(`(^|[^a-z])${escapeRegExp(n.toLowerCase())}([^a-z]|$)`);
      if (re.test(lower) && n.length > len) {
        city = c;
        len = n.length;
      }
    }
  }
  if (city) return { lat: city.lat, lng: city.lng, label: `${city.name}, ${city.state}`, source: "city" };
  return null;
}
