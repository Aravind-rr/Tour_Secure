// backend/src/config/env.ts

type Env = {
  PORT: number;
  NODE_ENV: "development" | "production" | "test";
  // Normalized canonical field we’ll use everywhere else:
  MONGO_URL: string;

  CORS_ORIGINS: string[]; // parsed list
  SERVER_BASE_URL?: string;

  JWT_SECRET: string;
  JWT_EXPIRES_DAYS: number;
  AUTH_COOKIE_NAME: string;

  FILE_STORAGE_DIR?: string;

  CONTRACT_ADDRESS?: string;
  BLOCKCHAIN_RPC?: string;
  BLOCKCHAIN_PRIVATE_KEY?: string;
};

function required(name: string, v: string | undefined): string {
  if (v === undefined || v === null || String(v).trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return String(v);
}

function parseNumber(name: string, v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseOrigins(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Normalize env and support multiple Mongo var names:
 * - MONGO_URL (preferred)
 * - MONGO_URI
 * - MONGODB_URI
 */
export function getEnv(): Env {
  const {
    PORT,
    NODE_ENV,
    // DB names that might exist (support all)
    MONGO_URL,
    MONGO_URI,
    MONGODB_URI,

    CORS_ORIGINS,
    SERVER_BASE_URL,

    JWT_SECRET,
    JWT_EXPIRES_DAYS,
    AUTH_COOKIE_NAME,

    FILE_STORAGE_DIR,

    CONTRACT_ADDRESS,
    BLOCKCHAIN_RPC,
    BLOCKCHAIN_PRIVATE_KEY,
  } = process.env as NodeJS.ProcessEnv & Record<string, string>;

  // Pick the first non-empty among the three; prefer MONGO_URL if present
  const mongoUrl =
    (MONGO_URL && String(MONGO_URL).trim()) ||
    (MONGO_URI && String(MONGO_URI).trim()) ||
    (MONGODB_URI && String(MONGODB_URI).trim());

  if (!mongoUrl) {
    // Keep the exact message your previous code showed, but add a hint:
    throw new Error(
      "Missing required env var: MONGO_URI or MONGODB_URI (hint: MONGO_URL is also supported)"
    );
  }

  return {
    PORT: parseNumber("PORT", PORT, 4000),
    NODE_ENV: (NODE_ENV as Env["NODE_ENV"]) || "development",
    MONGO_URL: mongoUrl,

    CORS_ORIGINS: parseOrigins(CORS_ORIGINS),
    SERVER_BASE_URL,

    JWT_SECRET: required("JWT_SECRET", JWT_SECRET),
    JWT_EXPIRES_DAYS: parseNumber("JWT_EXPIRES_DAYS", JWT_EXPIRES_DAYS, 7),
    AUTH_COOKIE_NAME: (AUTH_COOKIE_NAME && String(AUTH_COOKIE_NAME).trim()) || "toursecure_token",

    FILE_STORAGE_DIR,

    CONTRACT_ADDRESS,
    BLOCKCHAIN_RPC,
    BLOCKCHAIN_PRIVATE_KEY,
  };
}
