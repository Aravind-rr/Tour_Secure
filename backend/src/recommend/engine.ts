// backend/src/recommend/engine.ts
// Pure recommendation + trip-planning logic. No I/O: callers pass candidate
// places that already carry distance and safety info.

import { CATEGORIES, CATEGORY_IDS, classifyText, type CategoryId } from "./categories";
import type { BestTime, Place } from "./places.data";
import type { SafetyInfo } from "./safety";
import { haversineKm, round, travelMinutes, type LatLng } from "./geo";

export type Candidate = Place & { distanceKm: number; safety: SafetyInfo };

export type ScoredPlace = Candidate & {
  score: number; // 0..1-ish ranking score
  matchedCategory: CategoryId;
  reasons: string[];
  warnings: string[];
};

export type Weights = Partial<Record<CategoryId, number>>;

export type RankOptions = {
  origin: LatLng;
  radiusKm: number;
  categories?: CategoryId[]; // explicit user selection (empty = all)
  weights?: Weights; // learned interest profile (0..1)
  hour?: number; // local hour for time-of-day fit
  avoidUnsafe?: boolean;
  excludeNames?: string[];
};

/* ------------------------------------------------------------------ */
/* time of day                                                         */
/* ------------------------------------------------------------------ */

export type Slot = "morning" | "afternoon" | "evening" | "night";

export function slotForHour(hour: number): Slot {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

const SLOT_ORDER: Slot[] = ["morning", "afternoon", "evening", "night"];

export function timeFit(best: BestTime, slot: Slot): number {
  if (best === "any") return 0.7;
  if (best === slot) return 1;
  const d = Math.abs(SLOT_ORDER.indexOf(best) - SLOT_ORDER.indexOf(slot));
  return d === 1 ? 0.5 : 0.15;
}

/* ------------------------------------------------------------------ */
/* name matching (to skip places already in an itinerary)              */
/* ------------------------------------------------------------------ */

const STOP_WORDS = new Set(["the", "of", "and", "a", "at", "in", "visit", "to", "trip", "tour", "go", "see"]);

export function nameTokens(s: string): string[] {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** True when two names very likely refer to the same place. */
export function sameName(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  sa.forEach((t) => {
    if (sb.has(t)) inter++;
  });
  const smaller = Math.min(sa.size, sb.size);
  // all tokens of the shorter name appear in the longer one (e.g. "Red Fort" vs "Visit Red Fort Delhi")
  if (inter === smaller && smaller >= 1 && (smaller >= 2 || Math.max(sa.size, sb.size) <= 2)) return true;
  const union = sa.size + sb.size - inter;
  return union > 0 && inter / union >= 0.6;
}

/* ------------------------------------------------------------------ */
/* scoring                                                             */
/* ------------------------------------------------------------------ */

function interestFor(p: Place, opts: RankOptions): { value: number; matched: CategoryId } {
  const selected = opts.categories ?? [];
  const weights = opts.weights ?? {};
  const cats: CategoryId[] = [p.category, ...p.also];
  let best = 0;
  let matched: CategoryId = p.category;
  cats.forEach((c, i) => {
    const primary = i === 0 ? 1 : 0.7;
    let v = 0;
    if (selected.length) v = selected.includes(c) ? 1 : 0;
    else v = 0.6; // no explicit selection: neutral
    if (weights[c] !== undefined) v = Math.max(v * 0.6 + (weights[c] ?? 0) * 0.6, v);
    v *= primary;
    if (v > best) {
      best = v;
      matched = c;
    }
  });
  return { value: Math.min(1, best), matched };
}

export function scorePlace(c: Candidate, opts: RankOptions): ScoredPlace | null {
  const selected = opts.categories ?? [];
  if (selected.length) {
    const cats = [c.category, ...c.also];
    if (!cats.some((x) => selected.includes(x))) return null;
  }
  if (opts.excludeNames?.some((n) => sameName(n, c.name))) return null;
  if (opts.avoidUnsafe && c.safety.level === "unsafe") return null;
  if (c.distanceKm > opts.radiusKm) return null;

  const { value: interest, matched } = interestFor(c, opts);
  const pop = Math.max(0, Math.min(100, c.popularity)) / 100;
  const scale = Math.max(1, opts.radiusKm / 4);
  const dist = 1 / (1 + c.distanceKm / scale);
  const safety = c.safety.score / 100;
  const hour = opts.hour;
  const slot = hour !== undefined && Number.isFinite(hour) ? slotForHour(hour) : null;
  const tf = slot ? timeFit(c.bestTime, slot) : 0.7;

  let score = 0.34 * pop + 0.26 * dist + 0.22 * interest + 0.12 * safety + 0.06 * tf;
  // explicit selection: rank primary-category matches above "also fits" places
  if (selected.length && !selected.includes(c.category)) score *= 0.85;
  if (c.safety.level === "caution") score *= 0.9;
  if (c.safety.level === "unsafe") score *= 0.6;
  if (slot === "night" && !c.indoor && !["night", "evening"].includes(c.bestTime)) score *= 0.85;

  const reasons: string[] = [];
  const warnings: string[] = [];
  if (selected.includes(matched) || (opts.weights?.[matched] ?? 0) >= 0.5)
    reasons.push(`Matches your interest in ${CATEGORIES[matched].label.toLowerCase()}`);
  reasons.push(c.distanceKm < 1 ? `${Math.round(c.distanceKm * 1000)} m away` : `${round(c.distanceKm, 1)} km away`);
  if (slot && tf >= 1) reasons.push(`Great in the ${slot}`);
  if (c.popularity >= 85) reasons.push("Must-see landmark");
  if (c.safety.level === "safe") reasons.push(`Safe area (${c.safety.score}/100)`);
  // the safety badge already shows the level; only warn when it's actionable
  if (c.safety.level === "unsafe" || (c.safety.level === "caution" && c.safety.zone))
    warnings.push(`Safety ${c.safety.level} (${c.safety.score}/100)${c.safety.zone ? ` — ${c.safety.zone.name}` : ""}`);
  if (c.safety.night && !c.indoor) warnings.push("Late hour — consider visiting in daylight");

  return { ...c, score: round(score, 4), matchedCategory: matched, reasons, warnings };
}

export function rankPlaces(cands: Candidate[], opts: RankOptions): ScoredPlace[] {
  const out: ScoredPlace[] = [];
  const seen = new Set<string>();
  for (const c of cands) {
    const s = scorePlace(c, opts);
    if (!s) continue;
    const key = `${s.name.toLowerCase()}|${s.lat.toFixed(3)}|${s.lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Top-N per requested category (a place appears under its matched category). */
export function groupByCategory(
  ranked: ScoredPlace[],
  categories: CategoryId[],
  perCategory: number
): Record<string, ScoredPlace[]> {
  const cats = categories.length ? categories : [...CATEGORY_IDS];
  const groups: Record<string, ScoredPlace[]> = {};
  for (const c of cats) groups[c] = [];
  const used = new Set<string>();
  // Pass 1: by primary category; Pass 2: by secondary categories
  for (const pass of [0, 1]) {
    for (const p of ranked) {
      if (used.has(p.id)) continue;
      const list = pass === 0 ? [p.category] : p.also;
      for (const c of list) {
        const g = groups[c];
        if (g && g.length < perCategory) {
          g.push({ ...p, matchedCategory: c });
          used.add(p.id);
          break;
        }
      }
    }
  }
  return groups;
}

/** Round-robin across categories so a mixed list isn't dominated by one type. */
export function diversify(ranked: ScoredPlace[], limit: number): ScoredPlace[] {
  const buckets = new Map<CategoryId, ScoredPlace[]>();
  for (const p of ranked) {
    const b = buckets.get(p.category) ?? [];
    b.push(p);
    buckets.set(p.category, b);
  }
  const order = Array.from(buckets.entries()).sort((a, b) => (b[1][0]?.score ?? 0) - (a[1][0]?.score ?? 0));
  const out: ScoredPlace[] = [];
  let i = 0;
  while (out.length < limit && order.some(([, b]) => b.length > i)) {
    for (const [, b] of order) {
      const p = b[i];
      if (p && out.length < limit) out.push(p);
    }
    i++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* interest profile from an itinerary                                  */
/* ------------------------------------------------------------------ */

export type ItineraryLike = {
  title: string;
  notes?: string | undefined;
  location?: string | undefined;
  category?: string | undefined;
};

export type InterestProfile = {
  weights: Weights; // 0..1 normalised
  counts: Partial<Record<CategoryId, number>>;
  top: CategoryId[];
  gaps: CategoryId[]; // popular categories not yet covered
};

export function buildInterestProfile(items: ItineraryLike[], knownPlaces: Place[] = []): InterestProfile {
  const counts: Partial<Record<CategoryId, number>> = {};
  const bump = (c: CategoryId, n: number) => (counts[c] = (counts[c] ?? 0) + n);

  for (const it of items) {
    const explicit = CATEGORY_IDS.find((c) => c === it.category);
    if (explicit) {
      bump(explicit, 2);
      continue;
    }
    const known = knownPlaces.find((p) => sameName(p.name, it.title));
    if (known) {
      bump(known.category, 2);
      known.also.forEach((c) => bump(c, 0.5));
      continue;
    }
    const cats = classifyText(`${it.title} ${it.notes ?? ""}`);
    cats.slice(0, 2).forEach((c, i) => bump(c, i === 0 ? 1.5 : 0.75));
  }

  const max = Math.max(0, ...Object.values(counts).map((v) => v ?? 0));
  const weights: Weights = {};
  if (max > 0) for (const c of CATEGORY_IDS) if (counts[c]) weights[c] = round((counts[c] ?? 0) / max, 2);

  const top = (Object.keys(weights) as CategoryId[]).sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0));
  const core: CategoryId[] = ["historic", "food", "entertainment", "fun", "nature"];
  const gaps = core.filter((c) => !counts[c]);
  return { weights, counts, top, gaps };
}

/* ------------------------------------------------------------------ */
/* day-by-day trip planner                                             */
/* ------------------------------------------------------------------ */

export type Pace = "relaxed" | "balanced" | "packed";
type SlotKind = "sight" | "meal" | "evening";

const PACE_SLOTS: Record<Pace, Array<[string, SlotKind]>> = {
  relaxed: [["09:30", "sight"], ["13:00", "meal"], ["15:30", "sight"], ["19:30", "meal"]],
  balanced: [["09:00", "sight"], ["11:30", "sight"], ["13:30", "meal"], ["15:30", "sight"], ["18:30", "evening"]],
  packed: [["08:30", "sight"], ["10:30", "sight"], ["13:00", "meal"], ["14:30", "sight"], ["17:00", "sight"], ["19:30", "evening"]],
};

export type PlanStop = {
  time: string;
  endTime: string;
  slot: SlotKind;
  travelKmFromPrev: number;
  travelMins: number;
  note: string;
  place: ScoredPlace;
};

export type PlanDay = {
  day: number;
  date?: string;
  title: string;
  stops: PlanStop[];
  totalKm: number;
  categories: CategoryId[];
};

export type TripPlan = {
  origin: LatLng;
  pace: Pace;
  categories: CategoryId[];
  days: PlanDay[];
  warnings: string[];
  alternatives: ScoredPlace[];
};

export type PlanOptions = {
  origin: LatLng;
  days: number;
  categories: CategoryId[];
  pace?: Pace;
  startDate?: string; // YYYY-MM-DD
  avoidUnsafe?: boolean;
  radiusKm?: number;
  weights?: Weights;
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const toHHMM = (mins: number) => {
  const m = Math.max(0, Math.round(mins));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function addDays(dateStr: string, n: number): string | undefined {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function slotEligible(p: ScoredPlace, kind: SlotKind, sightCats: CategoryId[], selected: CategoryId[]): boolean {
  const cats = [p.category, ...p.also];
  if (kind === "meal") return p.category === "food";
  if (kind === "evening") {
    const eveningCats: CategoryId[] = ["entertainment", "food", "fun", "shopping", "nature", "spiritual", "historic"];
    const allowed = eveningCats.filter((c) => selected.includes(c) || c === "food");
    return cats.some((c) => allowed.includes(c)) && (p.bestTime === "evening" || p.bestTime === "night" || p.bestTime === "any" || p.category === "food");
  }
  return cats.some((c) => sightCats.includes(c));
}

export function planTrip(cands: Candidate[], opts: PlanOptions): TripPlan {
  const pace: Pace = opts.pace ?? "balanced";
  const days = Math.max(1, Math.min(7, Math.round(opts.days || 1)));
  const selected = opts.categories.length ? opts.categories : (["historic", "food", "entertainment", "fun"] as CategoryId[]);
  const radiusKm = opts.radiusKm ?? 40;
  const warnings: string[] = [];

  // rank everything once; include food even if not selected (meals are practical)
  const rankCats = Array.from(new Set<CategoryId>([...selected, "food"]));
  const ranked = rankPlaces(cands, {
    origin: opts.origin,
    radiusKm,
    categories: rankCats,
    ...(opts.weights ? { weights: opts.weights } : {}),
    ...(opts.avoidUnsafe !== undefined ? { avoidUnsafe: opts.avoidUnsafe } : {}),
  });
  const skippedUnsafe = opts.avoidUnsafe ? cands.filter((c) => c.safety.level === "unsafe").length : 0;
  if (skippedUnsafe) warnings.push(`Skipped ${skippedUnsafe} place(s) in low-safety areas.`);

  let sightCats: CategoryId[] = selected.filter((c) => c !== "food");
  if (!sightCats.length) sightCats = selected; // food crawl

  const used = new Set<string>();
  const planDays: PlanDay[] = [];

  for (let d = 0; d < days; d++) {
    const stops: PlanStop[] = [];
    let prev: LatLng = opts.origin;
    let clock = toMin(PACE_SLOTS[pace][0]?.[0] ?? "09:00");
    let totalKm = 0;
    const dayCatCount: Partial<Record<CategoryId, number>> = {};

    const slots = PACE_SLOTS[pace];
    for (let si = 0; si < slots.length; si++) {
      const [slotTime, kind] = slots[si]!;
      const nominal = toMin(slotTime);
      const nextNominal = si + 1 < slots.length ? toMin(slots[si + 1]![0]) : toMin("22:30");
      const slot = slotForHour(nominal / 60);
      let best: { p: ScoredPlace; s: number; km: number } | null = null;

      for (const p of ranked) {
        if (used.has(p.id) || !slotEligible(p, kind, sightCats, selected)) continue;
        const km = haversineKm(prev, p);
        let s = p.score + 0.25 * timeFit(p.bestTime, slot) - 0.035 * km;
        const last = stops[stops.length - 1];
        if (last && last.place.matchedCategory === p.matchedCategory && kind !== "meal") s -= 0.15;
        s -= 0.08 * (dayCatCount[p.matchedCategory] ?? 0);
        if (kind !== "meal" && !selected.includes(p.category)) s -= 0.1; // prefer primary-category matches
        if (slot !== "morning" && slot !== "afternoon" && !p.indoor && p.category === "nature" && p.bestTime !== "evening") s -= 0.2;
        // evening/night venues don't belong in daytime sightseeing slots
        if (kind === "sight" && (slot === "morning" || slot === "afternoon") && (p.bestTime === "evening" || p.bestTime === "night")) s -= 0.25;
        // penalise visits that would badly overrun the next slot (e.g. push lunch late)
        const eta = Math.max(nominal, clock + travelMinutes(km));
        const overrun = eta + (p.durationMins || 60) - (nextNominal + 45);
        if (overrun > 0) s -= overrun / 240;
        if (!best || s > best.s) best = { p, s, km };
      }
      if (!best) continue;

      const tMins = travelMinutes(best.km);
      const arrive = Math.max(nominal, clock + tMins);
      if (arrive > toMin("22:30")) break;
      const dur = best.p.durationMins || 60;
      const end = arrive + dur;

      used.add(best.p.id);
      dayCatCount[best.p.matchedCategory] = (dayCatCount[best.p.matchedCategory] ?? 0) + 1;
      totalKm += best.km;
      stops.push({
        time: toHHMM(arrive),
        endTime: toHHMM(end),
        slot: kind,
        travelKmFromPrev: round(best.km, 1),
        travelMins: tMins,
        note:
          kind === "meal"
            ? arrive < toMin("16:00") ? "Lunch" : "Dinner"
            : kind === "evening"
            ? "Evening"
            : `${CATEGORIES[best.p.matchedCategory].emoji} ${CATEGORIES[best.p.matchedCategory].label}`,
        place: best.p,
      });
      prev = best.p;
      clock = end;
    }

    const dayCats = Array.from(new Set(stops.map((s) => s.place.matchedCategory)));
    const city = mostCommon(stops.map((s) => s.place.city)) ?? "";
    const label = dayCats
      .filter((c) => c !== "food")
      .slice(0, 2)
      .map((c) => CATEGORIES[c].label.split(" ")[0])
      .join(" & ");
    const date = opts.startDate ? addDays(opts.startDate, d) : undefined;
    const pd: PlanDay = {
      day: d + 1,
      title: `${label || "Food"}${city ? ` in ${city}` : ""}`,
      stops,
      totalKm: round(totalKm, 1),
      categories: dayCats,
    };
    if (date) pd.date = date;
    planDays.push(pd);
    if (!stops.length) {
      warnings.push(`Not enough matching places for day ${d + 1}; try more categories or a larger radius.`);
      break;
    }
  }

  return {
    origin: opts.origin,
    pace,
    categories: selected,
    days: planDays,
    warnings,
    alternatives: ranked.filter((p) => !used.has(p.id)).slice(0, 6),
  };
}

function mostCommon(xs: string[]): string | undefined {
  const m = new Map<string, number>();
  xs.forEach((x) => x && m.set(x, (m.get(x) ?? 0) + 1));
  let best: string | undefined;
  let n = 0;
  m.forEach((v, k) => {
    if (v > n) {
      n = v;
      best = k;
    }
  });
  return best;
}

/** Strip heavy fields for API responses. */
export function toPlaceCard(p: ScoredPlace) {
  return {
    id: p.id,
    name: p.name,
    city: p.city,
    lat: p.lat,
    lng: p.lng,
    category: p.category,
    matchedCategory: p.matchedCategory,
    also: p.also,
    description: p.description,
    durationMins: p.durationMins,
    bestTime: p.bestTime,
    price: p.price,
    indoor: p.indoor,
    tags: p.tags,
    source: p.source,
    distanceKm: round(p.distanceKm, 2),
    score: p.score,
    safety: { score: p.safety.score, level: p.safety.level, zone: p.safety.zone?.name ?? null },
    reasons: p.reasons,
    warnings: p.warnings,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.city}`)}`,
  };
}

export type PlaceCard = ReturnType<typeof toPlaceCard>;
