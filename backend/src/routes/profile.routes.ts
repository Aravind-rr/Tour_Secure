// backend/src/routes/profile.routes.ts
// Emergency contacts + travel preferences for the signed-in user.
import { Router } from "express";
import User from "../models/User";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { parseCategories } from "../recommend/categories";

const router = Router();
router.use(requireAuth);

const MAX_CONTACTS = 5;
const PHONE_RX = /^\+?[0-9][0-9\s-]{5,19}$/;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function shape(u: any) {
  return {
    name: u?.name ?? null,
    email: u?.email ?? null,
    emergencyContacts: (u?.emergencyContacts ?? []).map((c: any) => ({
      id: String(c._id),
      name: c.name,
      phone: c.phone,
      relation: c.relation ?? "",
      email: c.email ?? "",
    })),
    interests: u?.interests ?? [],
    avoidUnsafe: u?.avoidUnsafe ?? true,
  };
}

/** GET /api/profile */
router.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const u = await User.findById(req.user!.id).lean();
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json({ ok: true, profile: shape(u) });
  } catch (e) {
    next(e);
  }
});

/** PUT /api/profile/contacts { contacts: [{ name, phone, relation?, email? }] } (replaces the list) */
router.put("/contacts", async (req: AuthedRequest, res, next) => {
  try {
    const raw = Array.isArray(req.body?.contacts) ? req.body.contacts : null;
    if (!raw) return res.status(400).json({ error: "contacts array required" });
    if (raw.length > MAX_CONTACTS) return res.status(400).json({ error: `At most ${MAX_CONTACTS} contacts` });

    const contacts: Array<{ name: string; phone: string; relation: string; email?: string }> = [];
    for (const [i, c] of raw.entries()) {
      const name = String(c?.name ?? "").trim().slice(0, 80);
      const phone = String(c?.phone ?? "").trim();
      const email = String(c?.email ?? "").trim().toLowerCase();
      if (!name) return res.status(400).json({ error: `Contact ${i + 1}: name is required` });
      if (!PHONE_RX.test(phone)) return res.status(400).json({ error: `Contact ${i + 1}: invalid phone number` });
      if (email && !EMAIL_RX.test(email)) return res.status(400).json({ error: `Contact ${i + 1}: invalid email` });
      contacts.push({ name, phone, relation: String(c?.relation ?? "").trim().slice(0, 40), ...(email ? { email } : {}) });
    }

    const u = await User.findByIdAndUpdate(req.user!.id, { $set: { emergencyContacts: contacts } }, { new: true, runValidators: true }).lean();
    res.json({ ok: true, profile: shape(u) });
  } catch (e) {
    next(e);
  }
});

/** PUT /api/profile/preferences { interests: string[], avoidUnsafe: boolean } */
router.put("/preferences", async (req: AuthedRequest, res, next) => {
  try {
    const $set: Record<string, unknown> = {};
    if ("interests" in (req.body ?? {})) $set.interests = parseCategories(req.body.interests);
    if ("avoidUnsafe" in (req.body ?? {})) $set.avoidUnsafe = !!req.body.avoidUnsafe;
    const u = await User.findByIdAndUpdate(req.user!.id, { $set }, { new: true }).lean();
    res.json({ ok: true, profile: shape(u) });
  } catch (e) {
    next(e);
  }
});

export default router;
