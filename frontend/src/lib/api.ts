// frontend/src/lib/api.ts
// Production builds (e.g. Vercel, where the API is served from the same domain)
// default to the relative "/api"; local dev defaults to the Docker backend.
export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/+$/, "") ||
  (import.meta.env.PROD ? "/api" : "http://localhost:8080/api");

// Backwards-compatible name used by older modules.
export const API_URL = API_BASE;


async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || j.message || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const get = async <T>(p: string) =>
  handle<T>(await fetch(`${API_BASE}${p}`, { credentials: "include" }));
export const post = async <T, B=unknown>(p: string, body?: B) =>
  handle<T>(await fetch(`${API_BASE}${p}`, {
    method: 'POST',
    credentials: "include",
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }));
