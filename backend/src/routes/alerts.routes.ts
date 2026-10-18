import { Router } from "express";
import Alert from "../models/Alert";
import { requireAuth } from "../middleware/auth";
import { createAlert, trackUrl } from "../services/alerts.service";

const r = Router();

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// user sends SOS (requires login)
r.post("/panic", requireAuth, async (req: any, res, next) => {
  try {
    const { lat, lon, lng, accuracy, message, meta } = req.body || {};
    const la = num(lat);
    const lo = num(lon ?? lng);
    const acc = num(accuracy);
    const out = await createAlert({
      userId: req.user.id,
      type: "sos",
      ...(la !== undefined && lo !== undefined ? { lat: la, lon: lo } : {}),
      ...(acc !== undefined ? { accuracy: acc } : {}),
      ...(message ? { message: String(message) } : {}),
      meta: meta && typeof meta === "object" ? meta : {},
    });
    res.json({
      ok: true,
      id: out.alert._id,
      trackUrl: out.trackUrl,
      shareText: out.shareText,
      contacts: out.contacts.map((c: any) => ({ name: c.name, phone: c.phone, relation: c.relation ?? null })),
    });
  } catch (e) {
    next(e);
  }
});

// my recent alerts
r.get("/mine", requireAuth, async (req: any, res, next) => {
  try {
    const items: any[] = await Alert.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(20).lean();
    res.json({
      ok: true,
      items: items.map((a) => ({
        id: String(a._id),
        type: a.type ?? "sos",
        status: a.status ?? "open",
        lat: a.lat ?? null,
        lon: a.lon ?? null,
        message: a.message ?? null,
        createdAt: a.createdAt,
        trackUrl: a.shareToken ? trackUrl(a.shareToken) : null,
        shareActive: !!(a.shareExpiresAt && new Date(a.shareExpiresAt).getTime() > Date.now()),
      })),
    });
  } catch (e) {
    next(e);
  }
});

// live location update while an alert is open
r.post("/:id/location", requireAuth, async (req: any, res, next) => {
  try {
    const la = num(req.body?.lat);
    const lo = num(req.body?.lon ?? req.body?.lng);
    if (la === undefined || lo === undefined) return res.status(400).json({ error: "lat & lon required" });
    const acc = num(req.body?.accuracy);
    const updated = await Alert.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, status: { $in: ["open", "acknowledged"] } },
      {
        $set: { lat: la, lon: lo },
        $push: { trail: { $each: [{ lat: la, lon: lo, ...(acc !== undefined ? { accuracy: acc } : {}), at: new Date() }], $slice: -500 } },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "No active alert" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// user cancels (false alarm) or marks themselves safe
r.post("/:id/cancel", requireAuth, async (req: any, res, next) => {
  try {
    const safe = req.body?.reason === "safe";
    const updated = await Alert.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, status: { $in: ["open", "acknowledged"] } },
      {
        $set: {
          status: safe ? "resolved" : "cancelled",
          resolvedAt: new Date(),
          resolvedBy: req.user.id,
          resolutionNote: safe ? "User marked themselves safe" : "Cancelled by user (false alarm)",
        },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "No active alert" });
    res.json({ ok: true, status: (updated as any).status });
  } catch (e) {
    next(e);
  }
});

// PUBLIC: live tracking page data for people the tourist shared the link with
r.get("/track/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{32}$/.test(token)) return res.status(404).json({ ok: false, error: "not_found" });
    const a: any = await Alert.findOne({ shareToken: token }).populate({ path: "userId", select: "name" }).lean();
    if (!a) return res.status(404).json({ ok: false, error: "not_found" });
    if (a.shareExpiresAt && new Date(a.shareExpiresAt).getTime() < Date.now())
      return res.status(410).json({ ok: false, error: "expired" });
    const trail = (a.trail ?? []).slice(-100).map((p: any) => ({ lat: p.lat, lon: p.lon, at: p.at }));
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      type: a.type ?? "sos",
      status: a.status ?? "open",
      name: String(a.userId?.name || "Traveller").split(" ")[0],
      message: a.message ?? null,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      last: trail.length ? trail[trail.length - 1] : a.lat != null ? { lat: a.lat, lon: a.lon, at: a.updatedAt } : null,
      trail,
    });
  } catch (e) {
    next(e);
  }
});

export default r;
