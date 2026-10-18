// backend/src/routes/recommendations.routes.ts
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { optionalAuth } from "../middleware/optionalAuth";
import { CATEGORIES, CATEGORY_IDS, parseCategories } from "../recommend/categories";
import { planTripService, recommendForItinerary, recommendNearby, resolveOrigin } from "../services/recommend.service";
import { geocode } from "../services/geocode.service";
import { safetyAt } from "../services/safetyLookup.service";
import User from "../models/User";

const router = Router();

const truthy = (v: unknown) => v === true || ["1", "true", "yes", "on"].includes(String(v ?? "").toLowerCase());
const hourOf = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 24 ? n : undefined;
};

async function userInterests(userId?: string) {
  if (!userId) return [];
  const u: any = await User.findById(userId).select({ interests: 1 }).lean();
  return parseCategories(u?.interests ?? []);
}

/** GET /api/recommendations/categories */
router.get("/categories", (_req, res) => {
  res.json({ ok: true, categories: CATEGORY_IDS.map((id) => CATEGORIES[id]) });
});

/** GET /api/recommendations/geocode?q=Shillong */
router.get("/geocode", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.status(400).json({ error: "q is required" });
    const r = await geocode(q);
    if (!r) return res.status(404).json({ ok: false, error: "Location not found" });
    res.json({ ok: true, result: r });
  } catch (e) {
    next(e);
  }
});

/** GET /api/recommendations/safety?lat=&lng=&hour= — safety estimate for any point */
router.get("/safety", async (req, res, next) => {
  try {
    const resolved = await resolveOrigin(req.query);
    if (!resolved) return res.status(400).json({ error: "Provide lat & lng or location" });
    res.json({ ok: true, point: resolved.origin, label: resolved.label, safety: await safetyAt(resolved.origin.lat, resolved.origin.lng, hourOf(req.query.hour)) });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/recommendations/nearby
 *   ?lat=&lng=   or   ?location=Shillong
 *   &categories=historic,food  &radius=15 (km)  &limit=20  &perCategory=5
 *   &hour=18 (local hour)  &avoidUnsafe=1
 */
router.get("/nearby", optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const resolved = await resolveOrigin(req.query);
    if (!resolved) return res.status(400).json({ error: "Provide lat & lng, or a location we can find" });
    let categories = parseCategories(req.query.categories);
    if (!categories.length && truthy(req.query.useInterests)) categories = await userInterests(req.user?.id);
    const hour = hourOf(req.query.hour);

    const result = await recommendNearby({
      origin: resolved.origin,
      radiusKm: Number(req.query.radius) || 15,
      categories,
      limit: Number(req.query.limit) || 20,
      perCategory: Number(req.query.perCategory) || 5,
      ...(hour !== undefined ? { hour } : {}),
      avoidUnsafe: truthy(req.query.avoidUnsafe),
    });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, label: resolved.label, ...result });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/recommendations/itinerary?categories=&perStop=4&hour=&avoidUnsafe=1&itemId=
 * Suggestions around each of the user's itinerary stops + a "for you" list
 * learned from the categories already in the itinerary.
 */
router.get("/itinerary", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const hour = hourOf(req.query.hour);
    const itemId = typeof req.query.itemId === "string" ? req.query.itemId : undefined;
    const result = await recommendForItinerary(req.user!.id, {
      categories: parseCategories(req.query.categories),
      perStop: Number(req.query.perStop) || 4,
      ...(hour !== undefined ? { hour } : {}),
      avoidUnsafe: truthy(req.query.avoidUnsafe),
      ...(itemId ? { itemId } : {}),
    });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/recommendations/plan
 * body: { lat?, lng?, location?, days=2, categories=[], pace="balanced", startDate?, avoidUnsafe? }
 */
router.post("/plan", optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const b = req.body || {};
    const resolved = await resolveOrigin(b);
    if (!resolved) return res.status(400).json({ error: "Provide lat & lng, or a destination we can find" });
    let categories = parseCategories(b.categories);
    if (!categories.length) categories = await userInterests(req.user?.id);
    const startDate = typeof b.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.startDate) ? b.startDate : undefined;

    const plan = await planTripService({
      origin: resolved.origin,
      label: resolved.label,
      days: Number(b.days) || 2,
      categories,
      pace: b.pace,
      ...(startDate ? { startDate } : {}),
      avoidUnsafe: b.avoidUnsafe === undefined ? true : truthy(b.avoidUnsafe),
    });
    res.json({ ok: true, ...plan });
  } catch (e) {
    next(e);
  }
});

export default router;
