// backend/src/routes/reviews.routes.ts
import { Router } from "express";
import SafetyScore from "../models/SafetyScore";
import Review from "../models/Review";
import { recomputeAreaFromReviews } from "../services/reviews.service";
import { calculateSafety } from "../utils/safety";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth";

const router = Router();

/* ---------- helpers ---------- */
function clean(s: string) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickPlaceName(body: any) {
  return clean(
    body?.areaName ??
      body?.place ??
      body?.name ??
      body?.location ??
      ""
  );
}

async function findArea(name: string) {
  const q = clean(name);
  if (!q) return null;
  const escaped = escapeRegExp(q);

  // exact match
  let doc = await SafetyScore.findOne({ name: { $regex: `^${escaped}$`, $options: "i" } });
  if (doc) return doc;

  // starts-with
  doc = await SafetyScore.findOne({ name: { $regex: `^${escaped}[,\\s]?.*`, $options: "i" } });
  if (doc) return doc;

  // contains
  return SafetyScore.findOne({ name: { $regex: escaped, $options: "i" } });
}

function toClientReview(r: any) {
  // normalize a single reliable field for UI
  const placeName =
    r?.areaName ||
    (typeof r?.area === "object" && r?.area?.name) ||
    null;

  return {
    id: String(r._id),
    areaId: r?.area ? String(r.area._id ?? r.area) : null,
    areaName: r?.areaName ?? null,
    placeName, // <- UI should read this
    rating: r.rating,
    text: r.text || "",
    createdAt: r.createdAt,
    userId: r?.userId ? String(r.userId) : null,
    userName: r?.userName ?? null, // NEW: expose review author name
  };
}

/* ---------- POST /api/reviews ---------- */
/* Require auth; attach userId & userName so UI can show author name */
router.post("/", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const areaIdRaw = (req.body.areaId ?? req.body.areaID) as string | undefined;
    const nameRaw = pickPlaceName(req.body);
    const ratingRaw = req.body.rating ?? req.body.stars ?? req.body.score ?? req.body.value;
    const rating = Number(ratingRaw);
    const text = clean(req.body.text ?? req.body.comment ?? req.body.review ?? "");

    // validation
    if (!nameRaw && !areaIdRaw) {
      return res.status(400).json({
        error: "Please provide an area name (areaName/place/location) or areaId.",
      });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5." });
    }

    // Link known safety areas. Free-text places remain valid reviews without
    // fabricating map coordinates for a new SafetyScore document.
    let areaDoc: any = null;
    if (areaIdRaw) {
      areaDoc = await SafetyScore.findById(areaIdRaw);
      if (!areaDoc) return res.status(404).json({ error: "Area not found for areaId." });
    } else {
      areaDoc = await findArea(nameRaw);
    }

    // current user (from requireAuth)
    const user = req.user!;
    const userName = user.name ?? user.email ?? null;

    // create review (store denormalized areaName + author info)
    const reviewDoc = await Review.create({
      area: areaDoc?._id,                 // NOTE: field name matches your schema
      areaName: areaDoc?.name ?? nameRaw, // <- ALWAYS saved
      rating,
      text,
      userId: user.id,                    // NEW
      userName,                           // NEW
      createdAt: new Date(),
    });

    // recompute area safety
    const recomputeKey = areaDoc?.name ?? nameRaw;
    await recomputeAreaFromReviews(recomputeKey);

    // fetch updated area for payload
    const refreshed = areaDoc?._id ? await SafetyScore.findById(areaDoc._id) : null;
    const areaPayload = refreshed
      ? {
          id: String(refreshed._id),
          name: refreshed.name,
          lat: refreshed.loc?.coordinates?.[1] ?? 0,
          lng: refreshed.loc?.coordinates?.[0] ?? 0,
          ratingCount: refreshed.ratingCount ?? 0,
          sentiment: refreshed.sentiment ?? 0,
          safety_score: calculateSafety(
            refreshed.crimeRate ?? 50,
            refreshed.infraScore ?? 50,
            refreshed.sentiment ?? 0
          ),
        }
      : null;

    // normalize review for client (includes placeName & userName)
    const reviewJson = toClientReview(reviewDoc.toObject());

    res.status(201).json({ ok: true, review: reviewJson, area: areaPayload });
  } catch (err) {
    next(err);
  }
});

/* ---------- GET /api/reviews (recent) ---------- */
router.get("/", async (req, res, next) => {
  try {
    const areaId = (req.query.areaId as string | undefined)?.trim();
    const areaName = clean(
      (req.query.areaName as string | undefined) ??
        (req.query.place as string | undefined) ??
        (req.query.location as string | undefined) ??
        ""
    );
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));

    const filter: any = {};
    if (areaId) filter.area = areaId;
    if (areaName) filter.areaName = new RegExp(`^${escapeRegExp(areaName)}$`, "i");

    // populate area so we can fallback to area.name if areaName missing
    const items = await Review.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({ path: "area", select: "name" }) // only need name
      .lean();

    // normalize each review for UI
    const reviews = items.map(toClientReview);

    res.json({ ok: true, reviews });
  } catch (err) {
    next(err);
  }
});

export default router;
