// backend/src/services/safetyLookup.service.ts
// Loads zones + area safety scores from MongoDB into a short-lived in-memory
// snapshot so we can score dozens of places per request without N queries.

import Zone from "../models/zone.model";
import SafetyScore from "../models/SafetyScore";
import { computeSafety, type SafetyInfo, type SafetySnapshot } from "../recommend/safety";

const TTL_MS = 60_000;
let cache: { at: number; snap: SafetySnapshot } | null = null;
let inflight: Promise<SafetySnapshot> | null = null;

async function load(): Promise<SafetySnapshot> {
  const zones: any[] = await Zone.find().select({ name: 1, riskLevel: 1, riskScore: 1, polygon: 1 }).lean().exec();
  const areas: any[] = await SafetyScore.find()
    .select({ name: 1, loc: 1, crimeRate: 1, infraScore: 1, sentiment: 1 })
    .limit(5000)
    .lean()
    .exec();
  return {
    zones: zones
      .filter((z) => Array.isArray(z?.polygon?.coordinates))
      .map((z) => ({
        id: String(z._id),
        name: String(z.name ?? "Zone"),
        riskLevel: (z.riskLevel ?? "medium") as "low" | "medium" | "high",
        riskScore: Number(z.riskScore ?? 50),
        coordinates: z.polygon.coordinates as number[][][],
      })),
    areas: areas
      .filter((a) => Array.isArray(a?.loc?.coordinates) && a.loc.coordinates.length === 2)
      .map((a) => ({
        id: String(a._id),
        name: String(a.name ?? "Area"),
        lng: Number(a.loc.coordinates[0]),
        lat: Number(a.loc.coordinates[1]),
        crimeRate: Number(a.crimeRate ?? 50),
        infraScore: Number(a.infraScore ?? 50),
        sentiment: Number(a.sentiment ?? 0),
      })),
  };
}

export async function getSafetySnapshot(): Promise<SafetySnapshot> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.snap;
  if (!inflight) {
    inflight = load()
      .then((snap) => {
        cache = { at: Date.now(), snap };
        return snap;
      })
      .catch((e) => {
        console.warn("safety snapshot load failed:", e?.message || e);
        return cache?.snap ?? { zones: [], areas: [] };
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function invalidateSafetyCache() {
  cache = null;
}

export async function safetyAt(lat: number, lng: number, hour?: number): Promise<SafetyInfo> {
  const snap = await getSafetySnapshot();
  return computeSafety(snap, { lat, lng }, hour);
}
