import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import EFIR from "../models/efir.model"; // Your e-FIR model file
import Alert from "../models/Alert";   // the Alert model from step 3
import CheckIn from "../models/CheckIn";
import { trackUrl } from "../services/alerts.service";

const r = Router();
r.use(requireAuth, requireAdmin);

r.get("/efir", async (_req, res) => {
  const items = await EFIR.find().sort({ createdAt: -1 }).limit(200);
  res.json(items);
});

r.get("/alerts", async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (typeof req.query.status === "string" && req.query.status) filter.status = req.query.status;
  const items: any[] = await Alert.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate({ path: "userId", select: "name email emergencyContacts" })
    .lean();
  // keep the original array shape (older UI reads lat/lon/createdAt directly)
  res.json(
    items.map((a) => ({
      ...a,
      type: a.type ?? "sos",
      status: a.status ?? "open",
      user: a.userId && typeof a.userId === "object" ? { id: String(a.userId._id), name: a.userId.name, email: a.userId.email, contacts: a.userId.emergencyContacts ?? [] } : null,
      userId: a.userId && typeof a.userId === "object" ? String(a.userId._id) : a.userId,
      trackUrl: a.shareToken ? trackUrl(a.shareToken) : null,
      trail: undefined,
      trailCount: (a.trail ?? []).length,
    }))
  );
});

/** PATCH /api/admin/alerts/:id { status: "acknowledged"|"resolved", note? } */
r.patch("/alerts/:id", async (req: any, res) => {
  const status = String(req.body?.status || "");
  if (!["acknowledged", "resolved", "open"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const $set: Record<string, unknown> = { status };
  if (status === "resolved") {
    $set.resolvedAt = new Date();
    $set.resolvedBy = req.user.id;
    if (req.body?.note) $set.resolutionNote = String(req.body.note).slice(0, 500);
  }
  const a = await Alert.findByIdAndUpdate(req.params.id, { $set }, { new: true }).lean();
  if (!a) return res.status(404).json({ error: "Alert not found" });
  res.json({ ok: true, alert: a });
});

/** Active check-ins (for the control room) */
r.get("/checkins", async (_req, res) => {
  const items = await CheckIn.find({ status: { $in: ["active", "escalated"] } })
    .sort({ dueAt: 1 })
    .limit(200)
    .populate({ path: "user", select: "name email" })
    .lean();
  res.json(items);
});

export default r;
