// backend/src/app.ts
// Builds the Express app. Used by the long-running server (index.ts) and by the
// Vercel serverless function (/api/index.ts at the repo root).
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { getEnv } from "./config/env";
import { connectMongo } from "./config/db";

// ---- Routers ----
import authRoutes from "./routes/auth.routes";
import alertsRoutes from "./routes/alerts.routes";
import adminRoutes from "./routes/admin.routes";
import userWalletRouter from "./routes/userWallet.routes";
import efirRouter from "./routes/efir.routes";
import geoRouter from "./routes/geo.routes";
import miscRouter from "./routes/misc.routes";
import digitalIdRouter from "./routes/digitalId";
import safetyRouter from "./routes/safety.routes";
import reviewsRouter from "./routes/reviews.routes";
import debugRouter from "./routes/debug.routes"; // ✅ use existing file name (no underscore)
import itineraryRoutes from "./routes/itinerary.routes"; // ✅ user-specific itinerary
import recommendationsRouter from "./routes/recommendations.routes";
import assistantRouter from "./routes/assistant.routes";
import checkinsRouter from "./routes/checkins.routes";
import profileRouter from "./routes/profile.routes";
import { maybeSweepCheckIns, sweepOverdueCheckIns } from "./services/alerts.service";

export type AppOptions = {
  /** Serverless mode: connect to Mongo lazily per request and sweep check-ins opportunistically. */
  serverless?: boolean;
};

export function createApp(opts: AppOptions = {}) {
  const env = getEnv();
  const app = express();

  // If you're behind a proxy (e.g., Vercel/Nginx) and using secure cookies
  app.set("trust proxy", 1);

  // ---- Core middleware (order matters) ----
  app.use(morgan("dev"));
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: true })); // support form posts
  app.use(express.json({ limit: "1mb" }));

  // ---- CORS (must be before routes) ----
  const origins = Array.isArray(env.CORS_ORIGINS)
    ? env.CORS_ORIGINS
    : String(env.CORS_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  app.use(
    cors({
      origin: origins.length ? origins : false,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Access-Token", "Cache-Control"],
      exposedHeaders: ["Set-Cookie"],
    })
  );
  // Preflight
  app.options("*", cors({ origin: origins.length ? origins : false, credentials: true }));

  // ---- Health ----
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", time: new Date().toISOString() })
  );

  // ---- Serverless: lazy (cached) DB connection + opportunistic check-in sweep ----
  if (opts.serverless) {
    app.use(async (_req, res, next) => {
      try {
        await connectMongo();
      } catch (e: any) {
        console.error("DB connection failed:", e?.message || e);
        return res.status(503).json({ error: "Database unavailable. Check MONGO_URL." });
      }
      // no background timers in serverless: escalate overdue check-ins at most every 30 s,
      // piggy-backing on normal traffic (bounded so requests are never slowed much)
      await maybeSweepCheckIns(1500);
      next();
    });
  }

  /**
   * Cron endpoint for escalating missed check-ins (Vercel Cron or any external
   * scheduler). Protected by CRON_SECRET when set: Authorization: Bearer <secret>.
   */
  app.get("/api/cron/sweep-checkins", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers["authorization"] !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!opts.serverless) await connectMongo();
    const escalated = await sweepOverdueCheckIns();
    res.json({ ok: true, escalated });
  });

  // ---- Routes ----
  app.use("/api/geo", geoRouter);
  app.use("/api/auth", authRoutes);
  app.use("/api/alerts", alertsRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/safety-scores", safetyRouter);
  app.use("/api/reviews", reviewsRouter);
  app.use("/api/user", userWalletRouter);
  app.use("/api/efir", efirRouter);
  app.use("/api/digital-id", digitalIdRouter);
  app.use("/api/itinerary", itineraryRoutes); // ✅ itinerary routes
  app.use("/api/recommendations", recommendationsRouter); // category / itinerary-based recommendations + planner
  app.use("/api/assistant", assistantRouter); // AI travel-safety assistant
  app.use("/api/checkins", checkinsRouter); // safe check-in timers
  app.use("/api/profile", profileRouter); // emergency contacts + preferences
  app.use("/api", miscRouter); // legacy fallbacks; canonical routes above take precedence

  // ---- Debug (only in dev) ----
  if (env.NODE_ENV !== "production") {
    app.use("/api/debug", debugRouter);
  }

  // ---- Fallback error handler (JSON instead of HTML stack traces) ----
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err?.message || err);
    const status = err?.name === "CastError" ? 400 : Number(err?.status) || 500;
    res.status(status).json({ error: status === 400 ? "Invalid request" : "Internal Server Error" });
  });

  return { app, env, origins };
}
