// frontend/src/services/assistant.ts
import { http } from "@/lib/http";
import type { PlaceCard, TripPlan } from "./recommendations";

export type AssistantAction =
  | { type: "sos"; label: string }
  | { type: "call"; label: string; href: string }
  | { type: "link"; label: string; href: string }
  | { type: "route"; label: string; to: string };

export type AssistantReply = {
  ok: boolean;
  reply: string;
  engine: "claude" | "offline";
  model?: string;
  cards: PlaceCard[];
  plan?: TripPlan;
  actions: AssistantAction[];
  suggestions: string[];
  itineraryChanged?: boolean;
  notice?: string;
};

export type ChatContext = {
  lat?: number;
  lng?: number;
  locationLabel?: string;
  localTime?: string;
  hour?: number;
  page?: string;
};

export async function sendChat(messages: Array<{ role: "user" | "assistant"; content: string }>, context: ChatContext): Promise<AssistantReply> {
  const { data } = await http.post("/assistant/chat", { messages, context });
  return data;
}

export async function assistantStatus(): Promise<{ engine: "claude" | "offline"; model?: string }> {
  try {
    const { data } = await http.get("/assistant/status");
    return data;
  } catch {
    return { engine: "offline" };
  }
}
