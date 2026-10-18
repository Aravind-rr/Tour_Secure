// backend/src/services/assistant/history.ts
// Pure sanitiser for chat history sent by the client.

export type ChatTurn = { role: "user" | "assistant"; content: string };

const MAX_TURNS = 16;
const MAX_CHARS = 4000;

/** Sanitise client history: roles, length, alternation, must start with user. */
export function normaliseHistory(raw: unknown): ChatTurn[] {
  const arr = Array.isArray(raw) ? raw : [];
  const turns: ChatTurn[] = [];
  for (const m of arr.slice(-MAX_TURNS)) {
    const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
    const content = typeof m?.content === "string" ? m.content.trim().slice(0, MAX_CHARS) : "";
    if (!role || !content) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${content}`.slice(0, MAX_CHARS * 2);
    else turns.push({ role, content });
  }
  while (turns.length && turns[0]!.role !== "user") turns.shift();
  return turns;
}
