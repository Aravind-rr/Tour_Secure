// Vercel serverless entry: the whole Express API as one function.
// vercel.json rewrites /api/* here; Express still sees the original URL
// (e.g. /api/recommendations/nearby), so all existing routes work unchanged.
import { createApp } from "../backend/src/app";

const { app } = createApp({ serverless: true });

export default app;
