// backend/src/services/alerts.service.ts
// Creating alerts, shareable live-tracking links, optional webhook fan-out
// (Slack/Discord/Teams/Twilio Functions/etc.) and the check-in escalation sweeper.

import crypto from "crypto";
import Alert from "../models/Alert";
import CheckIn from "../models/CheckIn";
import User from "../models/User";

const SHARE_TTL_HOURS = Number(process.env.ALERT_SHARE_TTL_HOURS || 24);
const CHECKIN_GRACE_SECONDS = Number(process.env.CHECKIN_GRACE_SECONDS || 120);
const SWEEP_EVERY_MS = Number(process.env.CHECKIN_SWEEP_MS || 30_000);

export function publicAppUrl(): string {
  const explicit = (process.env.PUBLIC_APP_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  // On Vercel the frontend and API share a domain; use the production domain
  // (or this deployment's URL for previews) so links work without extra config.
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  const firstOrigin = String(process.env.CORS_ORIGINS || "").split(",")[0]?.trim();
  return (firstOrigin || "http://localhost:5173").replace(/\/+$/, "");
}

export function trackUrl(token: string) {
  return `${publicAppUrl()}/track/${token}`;
}

export function shareMessage(name: string | undefined, url: string, type: string, lat?: number, lon?: number) {
  const who = name ? name.split(" ")[0] : "I";
  const what = type === "checkin_missed" ? `${who} missed a safety check-in` : `${who === "I" ? "I need" : `${who} needs`} help`;
  const where = Number.isFinite(lat) && Number.isFinite(lon) ? ` Last location: https://maps.google.com/?q=${lat},${lon}` : "";
  return `🚨 ${what} (Tour Secure). Live location: ${url}.${where} If you can't reach them, call 112.`;
}

async function postWebhook(payload: Record<string, unknown>): Promise<boolean> {
  const url = (process.env.ALERT_WEBHOOK_URL || "").trim();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (e: any) {
    console.warn("alert webhook failed:", e?.message || e);
    return false;
  }
}

export async function createAlert(input: {
  userId: string;
  type: "sos" | "checkin_missed" | "anomaly";
  lat?: number;
  lon?: number;
  accuracy?: number;
  message?: string;
  meta?: Record<string, unknown>;
}) {
  const user: any = await User.findById(input.userId).select({ name: 1, email: 1, emergencyContacts: 1 }).lean();
  const token = crypto.randomBytes(16).toString("hex");
  const hasLoc = Number.isFinite(input.lat) && Number.isFinite(input.lon);

  const alert: any = await Alert.create({
    userId: input.userId,
    type: input.type,
    status: "open",
    ...(hasLoc ? { lat: input.lat, lon: input.lon } : {}),
    trail: hasLoc ? [{ lat: input.lat, lon: input.lon, accuracy: input.accuracy, at: new Date() }] : [],
    ...(input.message ? { message: String(input.message).slice(0, 500) } : {}),
    shareToken: token,
    shareExpiresAt: new Date(Date.now() + SHARE_TTL_HOURS * 3600_000),
    contactsNotified: (user?.emergencyContacts ?? []).map((c: any) => c.name),
    meta: input.meta ?? {},
  });

  const url = trackUrl(token);
  const text = shareMessage(user?.name, url, input.type, input.lat, input.lon);

  // fire-and-forget webhook (don't block the SOS response)
  postWebhook({
    text,
    alert: { id: String(alert._id), type: input.type, lat: input.lat ?? null, lon: input.lon ?? null, createdAt: alert.createdAt, trackUrl: url },
    user: { id: input.userId, name: user?.name ?? null, email: user?.email ?? null },
    contacts: (user?.emergencyContacts ?? []).map((c: any) => ({ name: c.name, phone: c.phone, email: c.email ?? null })),
  }).then((ok) => ok && Alert.updateOne({ _id: alert._id }, { $set: { notifiedWebhook: true } }).catch(() => {}));

  return { alert, trackUrl: url, shareText: text, contacts: user?.emergencyContacts ?? [] };
}

/** Escalate overdue check-ins into alerts. Safe to run concurrently (atomic claim). */
export async function sweepOverdueCheckIns(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CHECKIN_GRACE_SECONDS * 1000);
  let escalated = 0;
  for (let i = 0; i < 50; i++) {
    const ci: any = await CheckIn.findOneAndUpdate(
      { status: "active", dueAt: { $lte: cutoff } },
      { $set: { status: "escalated" } },
      { new: true }
    ).lean();
    if (!ci) break;
    try {
      const { alert } = await createAlert({
        userId: String(ci.user),
        type: "checkin_missed",
        ...(Number.isFinite(ci.lat) ? { lat: ci.lat } : {}),
        ...(Number.isFinite(ci.lon) ? { lon: ci.lon } : {}),
        message: `Missed check-in "${ci.label}" (due ${new Date(ci.dueAt).toISOString()})`,
        meta: { checkInId: String(ci._id) },
      });
      await CheckIn.updateOne({ _id: ci._id }, { $set: { alertId: alert._id } });
      escalated++;
    } catch (e: any) {
      console.error("check-in escalation failed:", e?.message || e);
    }
  }
  return escalated;
}

/**
 * Serverless-friendly sweep: runs at most every 30 s (per warm instance),
 * waiting no longer than `maxWaitMs` so it never noticeably delays a request.
 */
let lastSweep = 0;
export async function maybeSweepCheckIns(maxWaitMs = 1500): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  const run = sweepOverdueCheckIns().then(
    (n) => {
      if (n) console.log(`⏱️  escalated ${n} missed check-in(s)`);
    },
    (e) => console.error("check-in sweep error:", e?.message || e)
  );
  await Promise.race([run, new Promise((r) => setTimeout(r, maxWaitMs))]);
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startCheckInSweeper() {
  if (timer) return;
  timer = setInterval(() => {
    sweepOverdueCheckIns().then(
      (n) => n && console.log(`⏱️  escalated ${n} missed check-in(s)`),
      (e) => console.error("check-in sweeper error:", e?.message || e)
    );
  }, SWEEP_EVERY_MS);
  (timer as any).unref?.();
}
