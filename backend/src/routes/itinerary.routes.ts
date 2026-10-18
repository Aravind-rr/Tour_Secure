// backend/src/routes/itinerary.routes.ts
import { Router } from "express";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth";
import Itinerary from "../models/itinerary.model";
import { isCategory, classifyText } from "../recommend/categories";
import { isValidLatLng } from "../recommend/geo";
import { geocode } from "../services/geocode.service";
import { getSafetySnapshot } from "../services/safetyLookup.service";
import { computeSafety } from "../recommend/safety";

const router = Router();

const SOURCES = ["manual", "recommendation", "plan", "assistant"] as const;

/** Normalise an incoming itinerary payload (create or update). */
function pick(body: any, partial = false) {
  const b = body && typeof body === "object" ? body : {};
  const out: Record<string, any> = {};
  const str = (v: any, max = 500) => String(v ?? "").trim().slice(0, max);

  if ("title" in b || !partial) out.title = str(b.title, 200);
  if ("date" in b) out.date = /^\d{4}-\d{2}-\d{2}$/.test(str(b.date)) ? str(b.date) : undefined;
  if ("time" in b) out.time = /^\d{1,2}:\d{2}$/.test(str(b.time)) ? str(b.time).padStart(5, "0") : undefined;
  if ("location" in b) out.location = str(b.location, 300) || undefined;
  if ("notes" in b) out.notes = str(b.notes, 2000) || undefined;
  if ("category" in b) out.category = isCategory(b.category) ? b.category : undefined;
  if ("placeId" in b) out.placeId = str(b.placeId, 120) || undefined;
  if ("done" in b) out.done = !!b.done;
  if ("source" in b && (SOURCES as readonly string[]).includes(b.source)) out.source = b.source;
  if ("lat" in b || "lng" in b) {
    if (isValidLatLng(b.lat, b.lng)) {
      out.lat = Number(b.lat);
      out.lng = Number(b.lng);
    } else if (b.lat === null || b.lng === null) {
      out.lat = undefined;
      out.lng = undefined;
    }
  }
  return out;
}

/** Fill category + coordinates when the client didn't send them (best effort). */
async function enrich(doc: Record<string, any>) {
  if (!doc.category) {
    const c = classifyText(`${doc.title ?? ""} ${doc.notes ?? ""}`)[0];
    if (c) doc.category = c;
  }
  if (doc.lat === undefined && (doc.location || doc.title)) {
    try {
      const g = (doc.location && (await geocode(doc.location))) || (await geocode(doc.title));
      if (g) {
        doc.lat = g.lat;
        doc.lng = g.lng;
      }
    } catch {
      /* geocoding is optional */
    }
  }
  return doc;
}

/**
 * POST /api/itinerary
 * Create a new itinerary item belonging to the logged-in user
 */
router.post("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const data = pick(req.body);
    if (!data.title) {
      return res.status(400).json({ error: "Title is required" });
    }
    await enrich(data);
    const item = await Itinerary.create({ ...data, user: req.user!.id });
    return res.status(201).json({ ok: true, item });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/itinerary/bulk  { items: [...] }
 * Save several items at once (e.g. a generated day plan). Max 50.
 */
router.post("/bulk", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const raw = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
    const docs: any[] = [];
    for (const r of raw) {
      const d = pick(r);
      if (!d.title) continue;
      await enrich(d);
      docs.push({ ...d, user: req.user!.id });
    }
    if (!docs.length) return res.status(400).json({ error: "No valid items" });
    const items = await Itinerary.insertMany(docs);
    return res.status(201).json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/itinerary[?withSafety=1]
 * Fetch ONLY the logged-in user's itinerary items
 */
router.get("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const items = (await Itinerary.find({ user: req.user!.id })
      .sort({ createdAt: -1 })
      .lean()) as any[];

    if (["1", "true"].includes(String(req.query.withSafety))) {
      const snap = await getSafetySnapshot();
      for (const it of items) {
        if (Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
          const hour = it.time ? Number(String(it.time).split(":")[0]) : undefined;
          const s = computeSafety(snap, { lat: it.lat, lng: it.lng }, hour);
          it.safety = { score: s.score, level: s.level, zone: s.zone?.name ?? null, advice: s.advice };
        }
      }
    }

    return res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/itinerary/:id
 * Update an itinerary item (only if it belongs to the logged-in user)
 */
router.patch("/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { id } = req.params;
    const update = pick(req.body, true);
    if ("title" in update && !update.title) return res.status(400).json({ error: "Title cannot be empty" });
    if ("location" in update && !("lat" in update)) {
      // location changed without coordinates: re-geocode
      update.lat = undefined;
      update.lng = undefined;
      if (update.location) {
        const g = await geocode(update.location).catch(() => null);
        if (g) {
          update.lat = g.lat;
          update.lng = g.lng;
        }
      }
    }

    const $set: Record<string, any> = {};
    const $unset: Record<string, 1> = {};
    for (const [k, v] of Object.entries(update)) {
      if (v === undefined) $unset[k] = 1;
      else $set[k] = v;
    }

    const updated = await Itinerary.findOneAndUpdate(
      { _id: id, user: req.user!.id }, // ownership filter
      { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Itinerary not found" });
    }

    return res.json({ ok: true, item: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/itinerary/:id
 * Delete an itinerary item (only if it belongs to the logged-in user)
 */
router.delete("/:id", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await Itinerary.findOneAndDelete({
      _id: id,
      user: req.user!.id,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Itinerary not found" });
    }

    return res.json({ ok: true, deletedId: id });
  } catch (err) {
    next(err);
  }
});

export default router;
