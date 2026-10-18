// backend/src/services/recommend.service.ts
// Orchestrates candidate retrieval (curated + OSM), safety scoring and the
// pure ranking / planning engine.

import Itinerary from "../models/itinerary.model";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "../recommend/categories";
import {
  buildInterestProfile,
  diversify,
  groupByCategory,
  planTrip,
  rankPlaces,
  toPlaceCard,
  type Pace,
  type PlaceCard,
  type ScoredPlace,
  type Weights,
} from "../recommend/engine";
import { haversineKm, round, type LatLng } from "../recommend/geo";
import { CURATED_PLACES } from "../recommend/places.data";
import { getCandidates, nearestCuratedCity } from "./places.service";
import { geocode } from "./geocode.service";
import { safetyAt } from "./safetyLookup.service";

export type NearbyInput = {
  origin: LatLng;
  radiusKm?: number;
  categories?: CategoryId[];
  limit?: number;
  perCategory?: number;
  hour?: number;
  avoidUnsafe?: boolean;
  weights?: Weights;
  excludeNames?: string[];
};

const cards = (xs: ScoredPlace[]) => xs.map(toPlaceCard);

function cardGroups(groups: Record<string, ScoredPlace[]>): Record<string, PlaceCard[]> {
  const out: Record<string, PlaceCard[]> = {};
  for (const [k, v] of Object.entries(groups)) out[k] = cards(v);
  return out;
}

export async function recommendNearby(input: NearbyInput) {
  const categories = input.categories ?? [];
  const limit = clampInt(input.limit, 1, 60, 20);
  const perCategory = clampInt(input.perCategory, 1, 15, 5);
  let radiusKm = clampNum(input.radiusKm, 1, 150, 15);
  let expanded = false;

  const run = async (r: number) => {
    const { candidates, sources } = await getCandidates(input.origin, r, input.hour);
    const ranked = rankPlaces(candidates, {
      origin: input.origin,
      radiusKm: r,
      categories,
      ...(input.weights ? { weights: input.weights } : {}),
      ...(input.hour !== undefined ? { hour: input.hour } : {}),
      ...(input.avoidUnsafe !== undefined ? { avoidUnsafe: input.avoidUnsafe } : {}),
      ...(input.excludeNames ? { excludeNames: input.excludeNames } : {}),
    });
    return { ranked, sources };
  };

  let { ranked, sources } = await run(radiusKm);
  if (ranked.length < 4 && radiusKm < 60) {
    radiusKm = Math.min(80, Math.max(radiusKm * 3, 40));
    expanded = true;
    ({ ranked, sources } = await run(radiusKm));
  }

  const originSafety = await safetyAt(input.origin.lat, input.origin.lng, input.hour);
  let hint: string | undefined;
  if (!ranked.length) {
    const near = nearestCuratedCity(input.origin);
    hint = near
      ? `No catalogued places within ${radiusKm} km. The nearest covered city is ${near.city} (${Math.round(near.distanceKm)} km).`
      : "No places found nearby.";
  }

  return {
    origin: input.origin,
    radiusKm,
    expanded,
    sources,
    categories: categories.length ? categories : [...CATEGORY_IDS],
    originSafety,
    total: ranked.length,
    items: cards(diversify(ranked, limit)),
    groups: cardGroups(groupByCategory(ranked, categories, perCategory)),
    ...(hint ? { hint } : {}),
  };
}

export async function resolveOrigin(q: {
  lat?: unknown;
  lng?: unknown;
  location?: unknown;
}): Promise<{ origin: LatLng; label: string } | null> {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { origin: { lat, lng }, label: "Your location" };
  }
  const text = typeof q.location === "string" ? q.location.trim() : "";
  if (text) {
    const g = await geocode(text);
    if (g) return { origin: { lat: g.lat, lng: g.lng }, label: g.label };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* itinerary-based                                                     */
/* ------------------------------------------------------------------ */

export async function recommendForItinerary(
  userId: string,
  opts: { categories?: CategoryId[]; perStop?: number; hour?: number; avoidUnsafe?: boolean; itemId?: string }
) {
  const items = (await Itinerary.find({ user: userId }).sort({ date: 1, createdAt: 1 }).lean()) as any[];
  const profile = buildInterestProfile(
    items.map((i) => ({ title: i.title, notes: i.notes, location: i.location, category: i.category })),
    CURATED_PLACES
  );
  const excludeNames = items.map((i) => String(i.title || "")).filter(Boolean);
  const perStop = clampInt(opts.perStop, 1, 10, 4);
  const selected = opts.categories ?? [];
  const focusCats: CategoryId[] = selected.length
    ? selected
    : Array.from(new Set<CategoryId>([...profile.top.slice(0, 3), ...profile.gaps.slice(0, 2)])).slice(0, 5);

  const today = new Date().toISOString().slice(0, 10);
  const targets = (opts.itemId ? items.filter((i) => String(i._id) === opts.itemId) : items)
    .filter((i) => !i.done)
    .sort((a, b) => {
      const ua = a.date && a.date >= today ? 0 : 1;
      const ub = b.date && b.date >= today ? 0 : 1;
      return ua - ub || String(a.date || "9999").localeCompare(String(b.date || "9999"));
    })
    .slice(0, 12);

  const stops: any[] = [];
  const unresolved: string[] = [];
  const pool = new Map<string, ScoredPlace>();
  const resolvedPoints: LatLng[] = [];

  for (const it of targets) {
    let coords: LatLng | null = null;
    let label = "";
    if (Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
      coords = { lat: it.lat, lng: it.lng };
      label = it.location || it.title;
    } else {
      const g = (it.location && (await geocode(it.location))) || (await geocode(it.title));
      if (g) {
        coords = { lat: g.lat, lng: g.lng };
        label = g.label;
      }
    }
    const itemOut = {
      id: String(it._id),
      title: it.title,
      date: it.date ?? null,
      time: it.time ?? null,
      location: it.location ?? null,
      category: it.category ?? null,
    };
    if (!coords) {
      unresolved.push(it.title);
      stops.push({ item: itemOut, resolved: null, safety: null, suggestions: [], byCategory: {} });
      continue;
    }
    resolvedPoints.push(coords);

    let radius = 10;
    let { candidates } = await getCandidates(coords, radius, opts.hour);
    if (candidates.length < 6) {
      radius = 30;
      ({ candidates } = await getCandidates(coords, radius, opts.hour));
    }
    const ranked = rankPlaces(candidates, {
      origin: coords,
      radiusKm: radius,
      categories: selected,
      weights: profile.weights,
      ...(opts.hour !== undefined ? { hour: opts.hour } : {}),
      ...(opts.avoidUnsafe !== undefined ? { avoidUnsafe: opts.avoidUnsafe } : {}),
      excludeNames,
    });
    ranked.forEach((p) => {
      const prev = pool.get(p.id);
      if (!prev || prev.score < p.score) pool.set(p.id, p);
    });

    stops.push({
      item: itemOut,
      resolved: { lat: coords.lat, lng: coords.lng, label },
      safety: await safetyAt(coords.lat, coords.lng, opts.hour),
      suggestions: cards(diversify(ranked, perStop + 2)),
      byCategory: cardGroups(groupByCategory(ranked, focusCats, perStop)),
    });
  }

  const forYou = cards(diversify(Array.from(pool.values()).sort((a, b) => b.score - a.score), 10));

  // ideas for categories the trip doesn't cover yet, near the trip's centre
  let gapIdeas: PlaceCard[] = [];
  if (resolvedPoints.length && profile.gaps.length) {
    const centre = {
      lat: resolvedPoints.reduce((s, p) => s + p.lat, 0) / resolvedPoints.length,
      lng: resolvedPoints.reduce((s, p) => s + p.lng, 0) / resolvedPoints.length,
    };
    const spread = Math.max(...resolvedPoints.map((p) => haversineKm(centre, p)));
    const radius = Math.min(80, Math.max(15, spread + 10));
    const { candidates } = await getCandidates(centre, radius, opts.hour);
    gapIdeas = cards(
      diversify(
        rankPlaces(candidates, {
          origin: centre,
          radiusKm: radius,
          categories: profile.gaps,
          ...(opts.avoidUnsafe !== undefined ? { avoidUnsafe: opts.avoidUnsafe } : {}),
          excludeNames,
        }),
        6
      )
    );
  }

  return {
    itemCount: items.length,
    profile: {
      ...profile,
      labels: profile.top.map((c) => CATEGORIES[c].label),
      gapLabels: profile.gaps.map((c) => CATEGORIES[c].label),
    },
    focusCategories: focusCats,
    stops,
    forYou,
    gapIdeas,
    unresolved,
  };
}

/* ------------------------------------------------------------------ */
/* day planner                                                         */
/* ------------------------------------------------------------------ */

export async function planTripService(input: {
  origin: LatLng;
  label?: string;
  days?: number;
  categories?: CategoryId[];
  pace?: Pace;
  startDate?: string;
  avoidUnsafe?: boolean;
  weights?: Weights;
}) {
  const days = clampInt(input.days, 1, 7, 2);
  const pace: Pace = input.pace && ["relaxed", "balanced", "packed"].includes(input.pace) ? input.pace : "balanced";
  const categories = input.categories ?? [];
  const perDay = pace === "relaxed" ? 4 : pace === "packed" ? 6 : 5;

  let radiusKm = 40;
  let { candidates, sources } = await getCandidates(input.origin, radiusKm);
  if (candidates.length < perDay * days) {
    radiusKm = 90;
    ({ candidates, sources } = await getCandidates(input.origin, radiusKm));
  }

  const plan = planTrip(candidates, {
    origin: input.origin,
    days,
    categories,
    pace,
    radiusKm,
    ...(input.startDate ? { startDate: input.startDate } : {}),
    ...(input.avoidUnsafe !== undefined ? { avoidUnsafe: input.avoidUnsafe } : {}),
    ...(input.weights ? { weights: input.weights } : {}),
  });

  return {
    origin: input.origin,
    label: input.label ?? null,
    radiusKm,
    sources,
    pace: plan.pace,
    categories: plan.categories,
    warnings: plan.warnings,
    days: plan.days.map((d) => ({
      ...d,
      stops: d.stops.map((s) => ({ ...s, place: toPlaceCard(s.place) })),
    })),
    alternatives: cards(plan.alternatives),
    totalStops: plan.days.reduce((n, d) => n + d.stops.length, 0),
    totalKm: round(plan.days.reduce((n, d) => n + d.totalKm, 0), 1),
  };
}

/* ------------------------------------------------------------------ */
function clampInt(v: unknown, lo: number, hi: number, dflt: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}
function clampNum(v: unknown, lo: number, hi: number, dflt: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, n)) : dflt;
}
