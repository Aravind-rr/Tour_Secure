// Run: npm test   (node --test with ts-node transpile-only; no DB needed)
import test from "node:test";
import assert from "node:assert/strict";

import { classifyText, parseCategories, categoryFromOsmTags } from "../src/recommend/categories";
import { haversineKm, pointInPolygon } from "../src/recommend/geo";
import { computeSafety, levelFor } from "../src/recommend/safety";
import { CURATED_PLACES, CITIES } from "../src/recommend/places.data";
import {
  rankPlaces,
  groupByCategory,
  diversify,
  planTrip,
  buildInterestProfile,
  sameName,
  slotForHour,
  type Candidate,
} from "../src/recommend/engine";
import { geocodeOffline } from "../src/recommend/geocodeOffline";
import { calculateSafety } from "../src/utils/safety";

const CHENNAI = { lat: 13.0827, lng: 80.2707 };
const RED_ZONE = {
  id: "z1",
  name: "RedZone",
  riskLevel: "high" as const,
  riskScore: 80,
  coordinates: [[[80.25, 13.08], [80.32, 13.08], [80.32, 13.12], [80.25, 13.12], [80.25, 13.08]]],
};

function candidates(origin = CHENNAI, hour?: number, zones = [RED_ZONE]): Candidate[] {
  const snap = { zones, areas: [] };
  return CURATED_PLACES.map((p) => ({ ...p, distanceKm: haversineKm(origin, p), safety: computeSafety(snap, p, hour) }));
}

test("curated catalogue is well-formed", () => {
  assert.ok(CURATED_PLACES.length >= 100);
  const ids = new Set<string>();
  for (const p of CURATED_PLACES) {
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.lat > 6 && p.lat < 37 && p.lng > 68 && p.lng < 98, `${p.name} outside India bbox`);
    assert.ok(p.popularity >= 0 && p.popularity <= 100);
    assert.ok(!p.also.includes(p.category), `${p.name} lists its primary category in also[]`);
  }
  for (const c of CITIES) assert.ok(c.lat > 6 && c.lat < 37 && c.lng > 68 && c.lng < 98, c.name);
});

test("text classifier picks sensible categories", () => {
  assert.equal(classifyText("Visit Red Fort and the museum")[0], "historic");
  assert.ok(classifyText("Dinner: biryani at a local restaurant").includes("food"));
  assert.ok(classifyText("Johari Bazaar shopping").includes("shopping"));
  assert.ok(classifyText("Sunset at Umiam Lake").includes("nature"));
  assert.deepEqual(classifyText(""), []);
  // whole-word matching: "barbecue" must not trigger "bar" (entertainment)
  assert.ok(!classifyText("barbecue").includes("entertainment"));
});

test("parseCategories validates and maps aliases", () => {
  assert.deepEqual(parseCategories("history,food,bogus,FOOD"), ["historic", "food"]);
  assert.deepEqual(parseCategories(["nightlife", "temples"]), ["entertainment", "spiritual"]);
  assert.deepEqual(parseCategories(undefined), []);
});

test("OSM tags map to categories", () => {
  assert.equal(categoryFromOsmTags({ amenity: "restaurant" }), "food");
  assert.equal(categoryFromOsmTags({ historic: "fort" }), "historic");
  assert.equal(categoryFromOsmTags({ amenity: "place_of_worship" }), "spiritual");
  assert.equal(categoryFromOsmTags({ tourism: "theme_park" }), "fun");
  assert.equal(categoryFromOsmTags({ amenity: "cinema" }), "entertainment");
  assert.equal(categoryFromOsmTags({ shop: "bakery" }), null);
});

test("point in polygon + zone-based safety", () => {
  const inside = { lat: 13.1, lng: 80.28 };
  const outside = { lat: 13.0, lng: 80.2 };
  assert.ok(pointInPolygon(inside, RED_ZONE.coordinates));
  assert.ok(!pointInPolygon(outside, RED_ZONE.coordinates));
  const s = computeSafety({ zones: [RED_ZONE], areas: [] }, inside, 14);
  assert.equal(s.source, "zone");
  assert.equal(s.score, 20);
  assert.equal(s.level, "unsafe");
  assert.ok(s.advice.length > 0);
  const b = computeSafety({ zones: [], areas: [] }, outside, 14);
  assert.equal(b.source, "baseline");
  assert.equal(levelFor(b.score), b.level);
});

test("night lowers safety and area data is distance-weighted", () => {
  const area = { id: "a", name: "Shillong", lat: 25.5788, lng: 91.8933, crimeRate: 30, infraScore: 75, sentiment: 0.5 };
  const snap = { zones: [], areas: [area] };
  const day = computeSafety(snap, { lat: 25.579, lng: 91.893 }, 13);
  const night = computeSafety(snap, { lat: 25.579, lng: 91.893 }, 23);
  assert.equal(day.source, "area");
  assert.ok(night.night && night.score < day.score);
  const far = computeSafety(snap, { lat: 26.5, lng: 91.0 }, 13); // >25 km away
  assert.equal(far.source, "baseline");
});

test("calculateSafety treats -1..1 sentiment as a scale, not 0", () => {
  assert.equal(calculateSafety(30, 75, 0), calculateSafety(30, 75, 50));
  assert.ok(calculateSafety(30, 75, 1) > calculateSafety(30, 75, -1));
});

test("rankPlaces respects categories, radius and avoidUnsafe", () => {
  const ranked = rankPlaces(candidates(CHENNAI, 14), { origin: CHENNAI, radiusKm: 20, categories: ["food"] });
  assert.ok(ranked.length > 0);
  for (const p of ranked) {
    assert.ok([p.category, ...p.also].includes("food"));
    assert.ok(p.distanceKm <= 20);
  }
  // sorted desc
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1]!.score >= ranked[i]!.score);

  // A zone covering a known place makes it unsafe -> excluded when avoidUnsafe
  const fort = CURATED_PLACES.find((p) => p.name === "Fort St. George")!;
  const box = { ...RED_ZONE, coordinates: [[[fort.lng - 0.01, fort.lat - 0.01], [fort.lng + 0.01, fort.lat - 0.01], [fort.lng + 0.01, fort.lat + 0.01], [fort.lng - 0.01, fort.lat + 0.01], [fort.lng - 0.01, fort.lat - 0.01]]] };
  const c = candidates(CHENNAI, 14, [box]);
  const withUnsafe = rankPlaces(c, { origin: CHENNAI, radiusKm: 20, categories: ["historic"] });
  const without = rankPlaces(c, { origin: CHENNAI, radiusKm: 20, categories: ["historic"], avoidUnsafe: true });
  assert.ok(withUnsafe.some((p) => p.id === fort.id));
  assert.ok(!without.some((p) => p.id === fort.id));
  assert.ok(withUnsafe.find((p) => p.id === fort.id)!.warnings.length > 0);
});

test("excludeNames skips places already in the itinerary", () => {
  const ranked = rankPlaces(candidates(), { origin: CHENNAI, radiusKm: 20, excludeNames: ["Visit Marina Beach"] });
  assert.ok(!ranked.some((p) => p.name === "Marina Beach"));
});

test("groupByCategory and diversify", () => {
  const ranked = rankPlaces(candidates(), { origin: CHENNAI, radiusKm: 60 });
  const groups = groupByCategory(ranked, ["historic", "food", "fun", "entertainment"], 3);
  assert.deepEqual(Object.keys(groups), ["historic", "food", "fun", "entertainment"]);
  for (const g of Object.values(groups)) assert.ok(g.length <= 3 && g.length > 0);
  const mixed = diversify(ranked, 8);
  assert.equal(mixed.length, 8);
  assert.ok(new Set(mixed.slice(0, 4).map((p) => p.category)).size >= 3, "first items should span categories");
});

test("planTrip builds timed, non-repeating days with meals", () => {
  const plan = planTrip(candidates(CHENNAI), {
    origin: CHENNAI,
    days: 2,
    categories: ["historic", "food", "entertainment", "fun"],
    pace: "balanced",
    startDate: "2026-10-20",
    avoidUnsafe: true,
  });
  assert.equal(plan.days.length, 2);
  assert.equal(plan.days[0]!.date, "2026-10-20");
  assert.equal(plan.days[1]!.date, "2026-10-21");
  const ids = plan.days.flatMap((d) => d.stops.map((s) => s.place.id));
  assert.equal(new Set(ids).size, ids.length, "no place repeats");
  for (const d of plan.days) {
    assert.ok(d.stops.length >= 3);
    assert.ok(d.stops.some((s) => s.slot === "meal" && s.place.category === "food"), "has a meal");
    for (let i = 1; i < d.stops.length; i++) assert.ok(d.stops[i - 1]!.time <= d.stops[i]!.time, "chronological");
    for (const s of d.stops) assert.notEqual(s.place.safety.level, "unsafe");
  }
});

test("planTrip in a sparse area returns a warning rather than throwing", () => {
  const nowhere = { lat: 20.0, lng: 70.0 }; // Arabian Sea
  const plan = planTrip(candidates(nowhere), { origin: nowhere, days: 3, categories: ["historic"], radiusKm: 30 });
  assert.ok(plan.warnings.length > 0);
});

test("interest profile learns from itinerary items", () => {
  const p = buildInterestProfile(
    [{ title: "Red Fort" }, { title: "Qutub Minar" }, { title: "Dinner with biryani" }, { title: "Stuff", category: "fun" }],
    CURATED_PLACES
  );
  assert.equal(p.top[0], "historic");
  assert.ok((p.weights.food ?? 0) > 0);
  assert.ok(p.gaps.includes("entertainment"));
  assert.ok(!p.gaps.includes("historic"));
});

test("sameName matches variants but not unrelated names", () => {
  assert.ok(sameName("Taj Mahal", "Taj Mahal sunrise visit"));
  assert.ok(sameName("Marina Beach", "marina beach"));
  assert.ok(!sameName("Fort St. George", "Red Fort"));
  assert.ok(!sameName("", "Red Fort"));
});

test("slotForHour", () => {
  assert.equal(slotForHour(7), "morning");
  assert.equal(slotForHour(13), "afternoon");
  assert.equal(slotForHour(19), "evening");
  assert.equal(slotForHour(23), "night");
  assert.equal(slotForHour(2), "night");
});

test("offline geocoder: coordinates, places, cities and aliases", () => {
  assert.equal(geocodeOffline("13.08, 80.27")?.source, "coordinates");
  assert.equal(geocodeOffline("Hawa Mahal")?.source, "place");
  const g = geocodeOffline("Lunch somewhere in Shillong");
  assert.equal(g?.source, "city");
  assert.ok(g && Math.abs(g.lat - 25.5788) < 0.01);
  assert.equal(geocodeOffline("trip to bombay")?.label.startsWith("Mumbai"), true);
  assert.equal(geocodeOffline("zzzz qqqq"), null);
  // bare city names resolve to the city, not a same-named landmark ("Shillong Peak")
  assert.equal(geocodeOffline("Shillong")?.source, "city");
  assert.equal(geocodeOffline("Shillong Peak")?.source, "place");
  assert.equal(geocodeOffline("Jaipur, Rajasthan")?.label, "Jaipur, Rajasthan");
});
