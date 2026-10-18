// backend/src/recommend/safety.ts
// Pure safety estimation for any coordinate, combining:
//   1. Geo-fenced risk zones (Zone collection; riskScore = risk, higher = riskier)
//   2. Nearest area safety score (SafetyScore collection, crime/infra/sentiment)
//   3. Time of day (late night lowers the score)
// The DB-backed snapshot is loaded by services/safetyLookup.service.ts.

import { calculateSafety } from "../utils/safety";
import { haversineKm, pointInPolygon, type LatLng, round } from "./geo";

export type ZoneSnap = {
  id: string;
  name: string;
  riskLevel: "low" | "medium" | "high";
  riskScore: number; // 0..100 risk
  coordinates: number[][][];
};

export type AreaSnap = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  crimeRate: number;
  infraScore: number;
  sentiment: number;
};

export type SafetySnapshot = { zones: ZoneSnap[]; areas: AreaSnap[] };

export type SafetyLevel = "safe" | "moderate" | "caution" | "unsafe";

export type SafetyInfo = {
  score: number; // 0..100, higher = safer
  level: SafetyLevel;
  source: "zone" | "area" | "baseline";
  confidence: "high" | "medium" | "low";
  zone?: { name: string; riskLevel: string; riskScore: number };
  area?: { name: string; distanceKm: number; score: number };
  night: boolean;
  advice: string[];
};

export const BASELINE_SAFETY = 65;
export const AREA_INFLUENCE_KM = 25;

export function levelFor(score: number): SafetyLevel {
  if (score >= 75) return "safe";
  if (score >= 55) return "moderate";
  if (score >= 40) return "caution";
  return "unsafe";
}

export function isNightHour(hour: number | undefined): boolean {
  if (hour === undefined || !Number.isFinite(hour)) return false;
  return hour >= 21 || hour < 5;
}

export function computeSafety(snap: SafetySnapshot, pt: LatLng, hour?: number): SafetyInfo {
  // 1) zones the point falls inside (pick the riskiest)
  let zone: ZoneSnap | null = null;
  for (const z of snap.zones) {
    if (pointInPolygon(pt, z.coordinates) && (!zone || z.riskScore > zone.riskScore)) zone = z;
  }

  // 2) nearest scored area within influence radius
  let area: AreaSnap | null = null;
  let areaDist = Infinity;
  for (const a of snap.areas) {
    const d = haversineKm(pt, a);
    if (d < areaDist) {
      areaDist = d;
      area = a;
    }
  }
  const areaInRange = area && areaDist <= AREA_INFLUENCE_KM ? area : null;
  const areaScore = areaInRange
    ? calculateSafety(areaInRange.crimeRate, areaInRange.infraScore, areaInRange.sentiment)
    : null;

  let score: number;
  let source: SafetyInfo["source"];
  let confidence: SafetyInfo["confidence"];

  if (zone) {
    const zoneSafety = 100 - clamp(zone.riskScore);
    score = areaScore !== null ? zoneSafety * 0.7 + areaScore * 0.3 : zoneSafety;
    source = "zone";
    confidence = "high";
  } else if (areaInRange && areaScore !== null) {
    const w = Math.max(0, 1 - areaDist / AREA_INFLUENCE_KM);
    score = areaScore * w + BASELINE_SAFETY * (1 - w);
    source = "area";
    confidence = w > 0.6 ? "high" : "medium";
  } else {
    score = BASELINE_SAFETY;
    source = "baseline";
    confidence = "low";
  }

  const night = isNightHour(hour);
  if (night) score -= 8;
  score = Math.round(clamp(score));
  const level = levelFor(score);

  const advice: string[] = [];
  if (zone && zone.riskLevel === "high") advice.push("High-risk zone — stay on main roads and avoid going alone.");
  else if (zone && zone.riskLevel === "medium") advice.push("Medium-risk zone — keep valuables secure and stay aware of your surroundings.");
  if (night) advice.push("It's late — prefer well-lit, busy streets and registered taxis.");
  if (level === "unsafe") advice.push("Consider an alternative place or visit in daylight with company.");
  if (confidence === "low") advice.push("Limited safety data here — check recent reviews before going.");

  const info: SafetyInfo = { score, level, source, confidence, night, advice };
  if (zone) info.zone = { name: zone.name, riskLevel: zone.riskLevel, riskScore: zone.riskScore };
  if (areaInRange && areaScore !== null)
    info.area = { name: areaInRange.name, distanceKm: round(areaDist, 1), score: areaScore };
  return info;
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}
