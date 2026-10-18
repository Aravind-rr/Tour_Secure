import mongoose from "mongoose";
import { getEnv } from "./env";

// Cached across warm serverless invocations (and harmless for the long-running server).
let connecting: Promise<typeof mongoose> | null = null;
let listenersAttached = false;

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  const { MONGO_URL } = getEnv(); // ✅ use normalized key from env.ts

  if (!MONGO_URL || typeof MONGO_URL !== "string") {
    throw new Error("❌ MONGO_URL is missing or invalid. Check your .env file.");
  }

  connecting = mongoose
    .connect(MONGO_URL, { serverSelectionTimeoutMS: 8000 })
    .then((m) => {
      console.log("✅ Connected to MongoDB");
      return m;
    })
    .catch((err: any) => {
      connecting = null;
      // Hide credentials before logging
      const safe = MONGO_URL.replace(/:\/\/[^@]+@/, "://****:****@");
      console.error("❌ Mongo connection failed.");
      console.error("URI:", safe);
      console.error(err);
      // A long-running server can't do anything useful without a DB; a serverless
      // function should report the error and let the next request retry.
      if (!process.env.VERCEL) process.exit(1);
      throw err;
    });

  if (!listenersAttached) {
    listenersAttached = true;
    mongoose.connection.on("error", (e) => {
      console.error("❌ MongoDB error:", e);
    });
    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected");
    });
  }

  return connecting;
}
