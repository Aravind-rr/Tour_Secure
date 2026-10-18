// frontend/src/services/recommendations.ts
import { http } from "@/lib/http";
import type { CategoryId, SafetyLevel } from "@/lib/categories";

export type LatLng = { lat: number; lng: number };

export type PlaceCard = {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  category: CategoryId;
  matchedCategory: CategoryId;
  also: CategoryId[];
  description: string;
  durationMins: number;
  bestTime: "morning" | "afternoon" | "evening" | "night" | "any";
  price: number;
  indoor: boolean;
  tags: string[];
  source: "curated" | "osm";
  distanceKm: number;
  score: number;
  safety: { score: number; level: SafetyLevel; zone: string | null };
  reasons: string[];
  warnings: string[];
  mapsUrl: string;
};

export type SafetyInfo = {
  score: number;
  level: SafetyLevel;
  source: "zone" | "area" | "baseline";
  confidence: "high" | "medium" | "low";
  zone?: { name: string; riskLevel: string; riskScore: number };
  area?: { name: string; distanceKm: number; score: number };
  night: boolean;
  advice: string[];
};

export type NearbyResponse = {
  ok: boolean;
  label: string;
  origin: LatLng;
  radiusKm: number;
  expanded: boolean;
  sources: string[];
  categories: CategoryId[];
  originSafety: SafetyInfo;
  total: number;
  items: PlaceCard[];
  groups: Record<string, PlaceCard[]>;
  hint?: string;
};

export type PlanStop = {
  time: string;
  endTime: string;
  slot: "sight" | "meal" | "evening";
  travelKmFromPrev: number;
  travelMins: number;
  note: string;
  place: PlaceCard;
};

export type PlanDay = { day: number; date?: string; title: string; stops: PlanStop[]; totalKm: number; categories: CategoryId[] };

export type TripPlan = {
  ok?: boolean;
  origin: LatLng;
  label: string | null;
  radiusKm: number;
  sources: string[];
  pace: "relaxed" | "balanced" | "packed";
  categories: CategoryId[];
  warnings: string[];
  days: PlanDay[];
  alternatives: PlaceCard[];
  totalStops: number;
  totalKm: number;
};

export type ItineraryRecs = {
  ok: boolean;
  itemCount: number;
  profile: {
    weights: Partial<Record<CategoryId, number>>;
    top: CategoryId[];
    gaps: CategoryId[];
    labels: string[];
    gapLabels: string[];
  };
  focusCategories: CategoryId[];
  stops: Array<{
    item: { id: string; title: string; date: string | null; time: string | null; location: string | null; category: string | null };
    resolved: { lat: number; lng: number; label: string } | null;
    safety: SafetyInfo | null;
    suggestions: PlaceCard[];
    byCategory: Record<string, PlaceCard[]>;
  }>;
  forYou: PlaceCard[];
  gapIdeas: PlaceCard[];
  unresolved: string[];
};

const csv = (c?: CategoryId[]) => (c && c.length ? c.join(",") : undefined);

export async function getNearby(params: {
  origin?: LatLng;
  location?: string;
  categories?: CategoryId[];
  radiusKm?: number;
  hour?: number;
  avoidUnsafe?: boolean;
  limit?: number;
  perCategory?: number;
  useInterests?: boolean;
}): Promise<NearbyResponse> {
  const { data } = await http.get("/recommendations/nearby", {
    params: {
      lat: params.origin?.lat,
      lng: params.origin?.lng,
      location: params.origin ? undefined : params.location,
      categories: csv(params.categories),
      radius: params.radiusKm,
      hour: params.hour,
      avoidUnsafe: params.avoidUnsafe ? 1 : undefined,
      limit: params.limit,
      perCategory: params.perCategory,
      useInterests: params.useInterests ? 1 : undefined,
    },
  });
  return data;
}

export async function getItineraryRecs(params: { categories?: CategoryId[]; hour?: number; avoidUnsafe?: boolean; perStop?: number; itemId?: string }): Promise<ItineraryRecs> {
  const { data } = await http.get("/recommendations/itinerary", {
    params: {
      categories: csv(params.categories),
      hour: params.hour,
      avoidUnsafe: params.avoidUnsafe ? 1 : undefined,
      perStop: params.perStop,
      itemId: params.itemId,
    },
  });
  return data;
}

export async function planTrip(body: {
  origin?: LatLng;
  location?: string;
  days: number;
  categories: CategoryId[];
  pace: "relaxed" | "balanced" | "packed";
  startDate?: string;
  avoidUnsafe?: boolean;
}): Promise<TripPlan> {
  const { data } = await http.post("/recommendations/plan", {
    lat: body.origin?.lat,
    lng: body.origin?.lng,
    location: body.origin ? undefined : body.location,
    days: body.days,
    categories: body.categories,
    pace: body.pace,
    startDate: body.startDate,
    avoidUnsafe: body.avoidUnsafe,
  });
  return data;
}

export async function geocode(q: string): Promise<{ lat: number; lng: number; label: string; source: string } | null> {
  try {
    const { data } = await http.get("/recommendations/geocode", { params: { q } });
    return data?.result ?? null;
  } catch {
    return null;
  }
}

export async function getSafety(origin: LatLng, hour?: number): Promise<SafetyInfo | null> {
  try {
    const { data } = await http.get("/recommendations/safety", { params: { lat: origin.lat, lng: origin.lng, hour } });
    return data?.safety ?? null;
  } catch {
    return null;
  }
}

/** Add one place to the signed-in user's itinerary. */
export async function addPlaceToItinerary(p: PlaceCard, opts: { date?: string; time?: string; notes?: string; source?: "recommendation" | "plan" | "assistant" } = {}) {
  const { data } = await http.post("/itinerary", {
    title: p.name,
    location: [p.name, p.city].filter(Boolean).join(", "),
    category: p.matchedCategory || p.category,
    lat: p.lat,
    lng: p.lng,
    placeId: p.id,
    date: opts.date,
    time: opts.time,
    notes: opts.notes ?? p.description,
    source: opts.source ?? "recommendation",
  });
  window.dispatchEvent(new CustomEvent("itinerary:changed"));
  return data?.item;
}

/** Save a generated plan (all days or one day) to the itinerary. */
export async function savePlanToItinerary(plan: TripPlan, onlyDay?: number) {
  const items = plan.days
    .filter((d) => onlyDay === undefined || d.day === onlyDay)
    .flatMap((d) =>
      d.stops.map((s) => ({
        title: s.place.name,
        date: d.date,
        time: s.time,
        location: [s.place.name, s.place.city].filter(Boolean).join(", "),
        category: s.place.matchedCategory || s.place.category,
        lat: s.place.lat,
        lng: s.place.lng,
        placeId: s.place.id,
        notes: `${s.note} · ${s.time}–${s.endTime}. ${s.place.description}`,
        source: "plan",
      }))
    );
  const { data } = await http.post("/itinerary/bulk", { items });
  window.dispatchEvent(new CustomEvent("itinerary:changed"));
  return data?.count ?? 0;
}

export function localHour() {
  return new Date().getHours();
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
