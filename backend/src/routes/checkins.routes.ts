// backend/src/routes/checkins.routes.ts
// Safe check-in timer: "If I don't check in within N minutes, raise an alert."
import { Router } from "express";
import CheckIn from "../models/CheckIn";
import Alert from "../models/Alert";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();
router.use(requireAuth);

const minutesOf = (v: unknown, dflt = 60) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(5, Math.min(720, n)) : dflt;
};
const coord = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function toClient(c: any) {
  if (!c) return null;
  return {
    id: String(c._id),
    label: c.label,
    dueAt: c.dueAt,
    status: c.status,
    lat: c.lat ?? null,
    lon: c.lon ?? null,
    alertId: c.alertId ? String(c.alertId) : null,
    createdAt: c.createdAt,
    completedAt: c.completedAt ?? null,
  };
}

/** POST /api/checkins { minutes, label?, lat?, lon? } — starts (or replaces) the active timer */
router.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const minutes = minutesOf(req.body?.minutes);
    const lat = coord(req.body?.lat);
    const lon = coord(req.body?.lon ?? req.body?.lng);
    await CheckIn.updateMany({ user: req.user!.id, status: "active" }, { $set: { status: "cancelled" } });
    const c = await CheckIn.create({
      user: req.user!.id,
      label: String(req.body?.label || "Safe check-in").slice(0, 120),
      dueAt: new Date(Date.now() + minutes * 60_000),
      ...(lat !== undefined && lon !== undefined ? { lat, lon, lastSeenAt: new Date() } : {}),
    });
    res.status(201).json({ ok: true, checkIn: toClient(c) });
  } catch (e) {
    next(e);
  }
});

/** GET /api/checkins/active — current timer + recent history */
router.get("/active", async (req: AuthedRequest, res, next) => {
  try {
    const [active, recent] = await Promise.all([
      CheckIn.findOne({ user: req.user!.id, status: "active" }).sort({ createdAt: -1 }).lean(),
      CheckIn.find({ user: req.user!.id, status: { $ne: "active" } }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);
    res.json({ ok: true, checkIn: toClient(active), recent: (recent as any[]).map(toClient), serverTime: new Date() });
  } catch (e) {
    next(e);
  }
});

/** POST /api/checkins/:id/complete — "I'm safe" (also resolves an alert if it already escalated) */
router.post("/:id/complete", async (req: AuthedRequest, res, next) => {
  try {
    const c: any = await CheckIn.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id, status: { $in: ["active", "escalated"] } },
      { $set: { status: "completed", completedAt: new Date() } },
      { new: true }
    ).lean();
    if (!c) return res.status(404).json({ error: "Check-in not found" });
    if (c.alertId) {
      await Alert.updateOne(
        { _id: c.alertId, status: { $in: ["open", "acknowledged"] } },
        { $set: { status: "resolved", resolvedAt: new Date(), resolvedBy: req.user!.id, resolutionNote: "User checked in (late)" } }
      );
    }
    res.json({ ok: true, checkIn: toClient(c) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/checkins/:id/extend { minutes } */
router.post("/:id/extend", async (req: AuthedRequest, res, next) => {
  try {
    const c: any = await CheckIn.findOne({ _id: req.params.id, user: req.user!.id, status: "active" });
    if (!c) return res.status(404).json({ error: "No active check-in" });
    const base = Math.max(Date.now(), new Date(c.dueAt).getTime());
    c.dueAt = new Date(base + minutesOf(req.body?.minutes, 30) * 60_000);
    await c.save();
    res.json({ ok: true, checkIn: toClient(c.toObject()) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/checkins/:id/ping { lat, lon } — refresh last known location */
router.post("/:id/ping", async (req: AuthedRequest, res, next) => {
  try {
    const lat = coord(req.body?.lat);
    const lon = coord(req.body?.lon ?? req.body?.lng);
    if (lat === undefined || lon === undefined) return res.status(400).json({ error: "lat & lon required" });
    const c = await CheckIn.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id, status: "active" },
      { $set: { lat, lon, lastSeenAt: new Date() } },
      { new: true }
    ).lean();
    if (!c) return res.status(404).json({ error: "No active check-in" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** POST /api/checkins/:id/cancel */
router.post("/:id/cancel", async (req: AuthedRequest, res, next) => {
  try {
    const c = await CheckIn.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id, status: "active" },
      { $set: { status: "cancelled" } },
      { new: true }
    ).lean();
    if (!c) return res.status(404).json({ error: "No active check-in" });
    res.json({ ok: true, checkIn: toClient(c) });
  } catch (e) {
    next(e);
  }
});

export default router;
