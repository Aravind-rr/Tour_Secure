// backend/src/index.ts
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

async function start() {
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
      allowedHeaders: ["Content-Type", "Authorization", "X-Access-Token"],
      exposedHeaders: ["Set-Cookie"],
    })
  );
  // Preflight
  app.options("*", cors({ origin: origins.length ? origins : false, credentials: true }));

  // ---- Health ----
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", time: new Date().toISOString() })
  );

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
  app.use("/api", miscRouter); // legacy fallbacks; canonical routes above take precedence

  // ---- Debug (only in dev) ----
  if (env.NODE_ENV !== "production") {
    app.use("/api/debug", debugRouter);
  }

  // ---- DB then listen ----
  await connectMongo();

  const port = Number(env.PORT) || 4000;
  app.listen(port, () => {
    console.log(`✅ API running at http://localhost:${port}`);
    console.log(`🔐 CORS origins: ${origins.join(", ") || "(none)"}`);
  });
}

start();
