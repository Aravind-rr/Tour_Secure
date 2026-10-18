// backend/src/services/assistant/index.ts
// Chooses the engine (Claude when ANTHROPIC_API_KEY is set, otherwise the
// offline rule-based engine) and returns a UI-friendly reply.

import { isValidLatLng } from "../../recommend/geo";
import { CLAUDE_MODEL, claudeChat, claudeEnabled, type ChatContext } from "./claude";
import type { ChatTurn } from "./history";

export { normaliseHistory } from "./history";
import { offlineReply } from "./offline";
import type { AssistantAction, ToolContext } from "./tools";

export type AssistantReply = {
  reply: string;
  engine: "claude" | "offline";
  model?: string;
  cards: any[];
  plan?: any;
  actions: AssistantAction[];
  suggestions: string[];
  itineraryChanged?: boolean;
  notice?: string;
};

export function assistantStatus() {
  return claudeEnabled() ? { engine: "claude" as const, model: CLAUDE_MODEL } : { engine: "offline" as const };
}

export async function chat(
  history: ChatTurn[],
  context: ChatContext & { hour?: number },
  user?: { id: string; name?: string | undefined }
): Promise<AssistantReply> {
  const ctx: ToolContext = {
    ...(user?.id ? { userId: user.id } : {}),
    ...(user?.name ? { userName: user.name } : {}),
    ...(isValidLatLng(context.lat, context.lng) ? { lat: Number(context.lat), lng: Number(context.lng) } : {}),
    ...(context.hour !== undefined && Number.isFinite(context.hour) ? { hour: context.hour } : {}),
    collected: { cards: [], actions: [] },
  };
  const lastUser = [...history].reverse().find((t) => t.role === "user")?.content ?? "";

  const finish = (reply: string, engine: AssistantReply["engine"], suggestions: string[], notice?: string): AssistantReply => ({
    reply,
    engine,
    ...(engine === "claude" ? { model: CLAUDE_MODEL } : {}),
    cards: ctx.collected.cards,
    ...(ctx.collected.plan ? { plan: ctx.collected.plan } : {}),
    actions: ctx.collected.actions,
    suggestions,
    ...(ctx.collected.itineraryChanged ? { itineraryChanged: true } : {}),
    ...(notice ? { notice } : {}),
  });

  if (claudeEnabled()) {
    try {
      const { text, toolsUsed } = await claudeChat(history, ctx, context);
      return finish(text, "claude", followUps(toolsUsed));
    } catch (e: any) {
      console.warn("Claude engine failed, falling back to offline:", e?.message || e);
      // reset anything partially collected, then fall through to offline
      ctx.collected = { cards: [], actions: [] };
      const off = await offlineReply(lastUser, ctx);
      return finish(off.reply, "offline", off.suggestions, "AI service unavailable — answered in offline mode.");
    }
  }

  const off = await offlineReply(lastUser, ctx);
  return finish(off.reply, "offline", off.suggestions);
}

function followUps(tools: string[]): string[] {
  if (tools.includes("plan_trip")) return ["Make it more relaxed", "Add more food stops", "Is the area safe at night?"];
  if (tools.includes("recommend_places")) return ["Plan a day with these", "Any food nearby?", "Is it safe at night?"];
  if (tools.includes("get_emergency_info")) return ["Nearest hospital", "Nearest police station", "How do I file an e-FIR?"];
  if (tools.includes("get_safety_info")) return ["Safety tips", "Recommend safe places nearby"];
  return ["Recommend places near me", "Plan a 2-day trip", "Emergency numbers"];
}
