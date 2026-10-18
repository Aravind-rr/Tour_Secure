// backend/src/routes/assistant.routes.ts
import { Router } from "express";
import type { AuthedRequest } from "../middleware/requireAuth";
import { optionalAuth } from "../middleware/optionalAuth";
import { rateLimit } from "../middleware/rateLimit";
import { assistantStatus, chat, normaliseHistory } from "../services/assistant";

const router = Router();

/** GET /api/assistant/status -> which engine answers (claude | offline) */
router.get("/status", (_req, res) => {
  res.json({ ok: true, ...assistantStatus() });
});

/**
 * POST /api/assistant/chat
 * body: {
 *   messages: [{ role: "user"|"assistant", content: string }],
 *   context?: { lat, lng, locationLabel, localTime, hour, page }
 * }
 */
router.post(
  "/chat",
  optionalAuth,
  rateLimit({ windowMs: 60_000, max: Number(process.env.ASSISTANT_RATE_PER_MIN || 20), name: "assistant" }),
  async (req: AuthedRequest, res, next) => {
    try {
      const history = normaliseHistory(req.body?.messages);
      if (!history.length) return res.status(400).json({ error: "messages must include at least one user message" });
      const c = req.body?.context ?? {};
      const hour = Number(c.hour);
      const reply = await chat(
        history,
        {
          ...(c.lat !== undefined ? { lat: Number(c.lat) } : {}),
          ...(c.lng !== undefined ? { lng: Number(c.lng) } : {}),
          ...(typeof c.locationLabel === "string" ? { locationLabel: c.locationLabel.slice(0, 120) } : {}),
          ...(typeof c.localTime === "string" ? { localTime: c.localTime.slice(0, 40) } : {}),
          ...(typeof c.page === "string" ? { page: c.page.slice(0, 60) } : {}),
          ...(Number.isFinite(hour) && hour >= 0 && hour < 24 ? { hour } : {}),
        },
        req.user ? { id: req.user.id, name: req.user.name } : undefined
      );
      res.json({ ok: true, ...reply });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
