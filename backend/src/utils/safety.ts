// backend/src/utils/safety.ts

/**
 * Calculate a safety score from 0 to 100.
 *
 * Inputs:
 *   crimeRate  -> 0 to 100, where higher means more crime / less safe
 *   infraScore -> 0 to 100, where higher means better infrastructure
 *   sentiment  -> generally treated as a 0 to 100 safety sentiment score
 *
 * The result is intentionally kept as a simple deterministic score
 * because the current routes consume calculateSafety() as a number.
 */
export function calculateSafety(
  crimeRate: number,
  infraScore: number,
  sentiment: number
): number {
  const crime = clamp(crimeRate, 0, 100);
  const infra = clamp(infraScore, 0, 100);
  // Seed data / the SafetyScore model store sentiment on a -1..+1 scale,
  // while some callers pass 0..100. Normalise the former onto 0..100 so a
  // neutral sentiment contributes 50 instead of being clamped to 0.
  const sent =
    Number.isFinite(sentiment) && Math.abs(sentiment) <= 1
      ? (sentiment + 1) * 50
      : clamp(sentiment, 0, 100);

  // Higher crime reduces safety.
  const crimeSafety = 100 - crime;

  // Infrastructure and sentiment positively influence safety.
  const score =
    crimeSafety * 0.5 +
    infra * 0.3 +
    sent * 0.2;

  return Math.round(clamp(score, 0, 100));
}

function clamp(
  value: number,
  min: number,
  max: number
): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}