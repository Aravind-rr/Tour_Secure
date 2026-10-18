// backend/src/services/assistant/claude.ts
// Claude (Anthropic Messages API) engine with tool use. Uses native fetch so
// no extra npm dependency is required.

import { TOOL_DEFS, runTool, type ToolContext } from "./tools";

const API_URL = process.env.ANTHROPIC_BASE_URL
  ? `${process.env.ANTHROPIC_BASE_URL.replace(/\/+$/, "")}/v1/messages`
  : "https://api.anthropic.com/v1/messages";

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_TOOL_ROUNDS = 5;
const TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS || 45000);

export function claudeEnabled(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || "").trim();
}

import type { ChatTurn } from "./history";
export type { ChatTurn } from "./history";

export type ChatContext = {
  lat?: number;
  lng?: number;
  locationLabel?: string;
  localTime?: string; // e.g. "2026-10-19 18:42"
  page?: string;
};

function systemPrompt(ctx: ToolContext, c: ChatContext): string {
  const where =
    ctx.lat !== undefined && ctx.lng !== undefined
      ? `The user's current location is approximately lat ${ctx.lat.toFixed(4)}, lng ${ctx.lng.toFixed(4)}${c.locationLabel ? ` (${c.locationLabel})` : ""}.`
      : "The user's location is unknown (they haven't shared it).";
  return [
    "You are Tour Secure Assistant, a friendly travel-safety and trip-planning companion inside the Tour Secure app for tourists in India.",
    "",
    "Context:",
    `- ${where}`,
    `- Local time: ${c.localTime || "unknown"}. Current app page: ${c.page || "unknown"}.`,
    `- User: ${ctx.userId ? `signed in as ${ctx.userName || "a traveller"}` : "guest (not signed in; itinerary tools unavailable)"}.`,
    "",
    "App features you can point to (use show_app_action to give a button): SOS alert with live-location share link, e-FIR police report, Safe Check-in timer (auto-alerts contacts if not checked in), Emergency contacts, Blockchain Digital Tourist ID with QR, Explore (category recommendations), Itinerary with safety badges.",
    "",
    "Rules:",
    "1. Safety first. If the user may be in danger or an emergency (harassment, attack, accident, being followed, medical issue), immediately tell them to call 112 and use SOS: call get_emergency_info and show_app_action('sos') before anything else. Keep that reply short and calm.",
    "2. Ground answers in tools. Use recommend_places / plan_trip / get_safety_info rather than inventing places or safety scores. Results are rendered as cards, so summarise briefly instead of repeating every detail.",
    "3. Never claim you contacted police, contacts or authorities — only the user's SOS button does that.",
    "4. Only call add_to_itinerary when the user explicitly asks to add/save something.",
    "5. Safety scores are estimates from Tour Secure data (zones, area reviews, time of day); say so when it matters. Mention when it's late at night.",
    "6. Be concise: usually under 120 words, use short bullet lists, light Markdown (bold, bullets). Reply in the user's language.",
    "7. Out of scope (medical diagnosis, legal advice): give general guidance and suggest a professional; for medical emergencies, 108/112.",
  ].join("\n");
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

type ApiMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

async function callApi(body: any): Promise<any> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": String(process.env.ANTHROPIC_API_KEY),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const err: any = new Error(`Claude API error: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function claudeChat(
  history: ChatTurn[],
  ctx: ToolContext,
  chatCtx: ChatContext
): Promise<{ text: string; toolsUsed: string[] }> {
  const messages: ApiMessage[] = history.map((t) => ({ role: t.role, content: t.content }));
  const toolsUsed: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const resp = await callApi({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt(ctx, chatCtx),
      tools: TOOL_DEFS,
      messages,
    });

    const content: ContentBlock[] = Array.isArray(resp?.content) ? resp.content : [];
    const toolUses = content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");

    if (resp?.stop_reason !== "tool_use" || !toolUses.length || round === MAX_TOOL_ROUNDS) {
      const text = content
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text: text || "Sorry, I couldn't come up with an answer. Could you rephrase?", toolsUsed };
    }

    messages.push({ role: "assistant", content });
    const results: ContentBlock[] = [];
    for (const tu of toolUses) {
      toolsUsed.push(tu.name);
      try {
        const out = await runTool(tu.name, tu.input ?? {}, ctx);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 12000) });
      } catch (e: any) {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: `Tool failed: ${e?.message || e}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "Sorry, that took too many steps. Please try a simpler question.", toolsUsed };
}
