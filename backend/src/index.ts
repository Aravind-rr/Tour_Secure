// backend/src/index.ts
// Long-running server (local dev, Docker). On Vercel the app is served by the
// serverless function in /api/index.ts instead.
import { createApp } from "./app";
import { connectMongo } from "./config/db";
import { startCheckInSweeper } from "./services/alerts.service";
import { assistantStatus } from "./services/assistant";

async function start() {
  const { app, env, origins } = createApp();

  // ---- DB then listen ----
  await connectMongo();
  startCheckInSweeper();

  const port = Number(env.PORT) || 4000;
  app.listen(port, () => {
    console.log(`✅ API running at http://localhost:${port}`);
    console.log(`🔐 CORS origins: ${origins.join(", ") || "(none)"}`);
    const ai = assistantStatus();
    console.log(`🤖 Assistant engine: ${ai.engine}${"model" in ai ? ` (${ai.model})` : " (set ANTHROPIC_API_KEY to enable Claude)"}`);
  });
}

start();
