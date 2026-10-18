// backend/src/services/assistant/offline.ts
// Rule-based assistant used when no ANTHROPIC_API_KEY is configured (or the
// API is unreachable). Detects intent + slots and calls the same tools as the
// Claude engine, so answers stay grounded in app data.

import { CATEGORIES } from "../../recommend/categories";
import { EMERGENCY_NUMBERS_IN, SAFETY_TIPS, runTool, type ToolContext } from "./tools";
import { RX, detectIntent, extractCategories, extractDays, extractLocation } from "./nlu";

export { detectIntent, extractCategories, extractDays, extractLocation } from "./nlu";

export type OfflineReply = { reply: string; suggestions: string[] };

const DEFAULT_SUGGESTIONS = [
  "Recommend historic places near me",
  "Plan a 2-day trip in Jaipur",
  "Is it safe here at night?",
  "Emergency numbers",
];

function bullets(xs: string[]) {
  return xs.map((x) => `• ${x}`).join("\n");
}

export async function offlineReply(text: string, ctx: ToolContext): Promise<OfflineReply> {
  const intent = detectIntent(text);
  const location = extractLocation(text);
  const locArg = location ? { location } : {};
  const name = ctx.userName ? ctx.userName.split(" ")[0] : "";

  switch (intent) {
    case "emergency": {
      await runTool("get_emergency_info", {}, ctx);
      await runTool("find_nearby_help", { kind: "police station" }, ctx);
      return {
        reply:
          "**If you are in immediate danger, call 112 now.**\n" +
          bullets([
            "Move towards a crowded, well-lit place (shop, hotel lobby, police booth).",
            "Press **SOS** below to alert your emergency contacts with your live location.",
            "Keep your phone on and stay on the line with the operator.",
          ]) +
          "\n\nPolice **100** · Ambulance **108** · Women helpline **1091**",
        suggestions: ["Nearest hospital", "Nearest police station", "How do I file an e-FIR?"],
      };
    }

    case "lost": {
      const cyber = /\b(scam|fraud|cheated|upi|card|online|otp)\b/i.test(text);
      await runTool("show_app_action", { action: "efir" }, ctx);
      await runTool("find_nearby_help", { kind: "police station" }, ctx);
      const steps = [
        "File an **e-FIR** in Tour Secure — you'll need it for insurance and replacement documents.",
        /passport/i.test(text)
          ? "Lost passport: report to police, then contact your embassy/consulate for an emergency travel document."
          : "Note the time, place and a description of the item.",
        cyber ? "Online/UPI fraud: call **1930** immediately and report at cybercrime.gov.in." : "Block cards/SIM right away if they were taken.",
        "Tourist helpline (24x7): **1800-11-1363**.",
      ];
      return { reply: `Sorry that happened. Here's what to do:\n${bullets(steps)}`, suggestions: ["Nearest police station", "Emergency numbers"] };
    }

    case "safety": {
      const atNight = /\b(night|tonight|late|after dark|midnight)\b/i.test(text);
      const r = await runTool("get_safety_info", { ...locArg, ...(atNight ? { hour: 22 } : {}) }, ctx);
      if (r?.error) return { reply: `I couldn't work out where you mean. ${location ? `I don't know "${location}".` : "Share your location or name a place."}`, suggestions: ["Is Police Bazaar, Shillong safe?", "Safety tips"] };
      const lvlEmoji: Record<string, string> = { safe: "🟢", moderate: "🟡", caution: "🟠", unsafe: "🔴" };
      const lines = [
        `${lvlEmoji[r.level] ?? ""} **${r.place}: ${r.level.toUpperCase()} (${r.score}/100)**`,
        r.zone ? `Geo-fenced zone: **${r.zone.name}** (${r.zone.riskLevel} risk).` : r.nearestScoredArea ? `Based on nearby area data: ${r.nearestScoredArea.name} (${r.nearestScoredArea.distanceKm} km).` : "Limited local data — this is a baseline estimate.",
        ...(r.advice?.length ? [bullets(r.advice)] : []),
      ];
      if (r.level === "caution" || r.level === "unsafe") await runTool("show_app_action", { action: "checkin" }, ctx);
      return { reply: lines.join("\n"), suggestions: ["Recommend safe places nearby", "Safety tips", "Start a check-in timer"] };
    }

    case "plan": {
      const cats = extractCategories(text).filter((c) => c !== "spiritual" || /temple|spiritual|religio/i.test(text));
      const r = await runTool("plan_trip", { ...locArg, days: extractDays(text), categories: cats }, ctx);
      if (r?.error) return { reply: "Where would you like to go? e.g. *“Plan 2 days in Jaipur with food and history”*.", suggestions: ["Plan 2 days in Jaipur", "Plan a day in Shillong", "Plan a day near me"] };
      const days = r.days as Array<{ day: number; title: string; stops: string[] }>;
      const head = `Here's a ${days.length}-day plan for **${r.destination}**${cats.length ? ` focused on ${cats.map((c) => CATEGORIES[c].label.toLowerCase()).join(", ")}` : ""}:`;
      const body = days.map((d) => `**Day ${d.day} · ${d.title}**\n${bullets(d.stops.slice(0, 6))}`).join("\n\n");
      const warn = r.warnings?.length ? `\n\n⚠️ ${r.warnings.join(" ")}` : "";
      return { reply: `${head}\n\n${body}${warn}\n\nYou can save it to your itinerary below.`, suggestions: ["Make it more relaxed", "Add more food stops", "Is the area safe at night?"] };
    }

    case "my_itinerary": {
      const r = await runTool("get_my_itinerary", {}, ctx);
      if (r?.error) return { reply: "Please sign in to see your itinerary.", suggestions: DEFAULT_SUGGESTIONS };
      if (!r.count) return { reply: "Your itinerary is empty. Want me to plan something?", suggestions: ["Plan a day near me", "Plan 2 days in Gangtok"] };
      const items = (r.items as any[]).slice(0, 10).map((i) => `${i.done ? "✅" : "▫️"} ${i.date ?? "No date"}${i.time ? ` ${i.time}` : ""} — **${i.title}**${i.location ? ` (${i.location})` : ""}`);
      return { reply: `You have ${r.count} item(s):\n${items.join("\n")}\n\nOpen **Explore → From my itinerary** for ideas near each stop.`, suggestions: ["Suggest places near my itinerary", "Add more food stops"] };
    }

    case "add_itinerary": {
      const m = text.match(/\b(?:add|save|put)\s+(.+?)\s+(?:to|in|into|on)\s+(?:my\s+)?(?:itinerary|plan|trip|schedule)/i);
      const date = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? (/\btomorrow\b/i.test(text) ? isoDate(1) : /\btoday\b/i.test(text) ? isoDate(0) : undefined);
      const time = text.match(/\b(\d{1,2}:\d{2})\b/)?.[1];
      const title = m?.[1]?.replace(/^(a|an|the)\s+/i, "").trim();
      if (!title) return { reply: "What should I add? e.g. *“Add Red Fort to my itinerary tomorrow 10:00”*.", suggestions: [] };
      const r = await runTool("add_to_itinerary", { title, ...(date ? { date } : {}), ...(time ? { time } : {}) }, ctx);
      if (r?.error) return { reply: "Please sign in first so I can save to your itinerary.", suggestions: [] };
      return { reply: `Added **${title}**${date ? ` on ${date}` : ""}${time ? ` at ${time}` : ""} to your itinerary ✅`, suggestions: ["Show my itinerary", "Suggest places nearby"] };
    }

    case "recommend": {
      const cats = extractCategories(text);
      const r = await runTool("recommend_places", { ...locArg, categories: cats, limit: 6 }, ctx);
      if (r?.error)
        return {
          reply: location ? `I couldn't find "${location}". Try a city name like Shillong, Gangtok or Jaipur.` : "Share your location (allow location access) or tell me a city, e.g. *“historic places in Delhi”*.",
          suggestions: ["Historic places in Delhi", "Food in Shillong", "Fun things in Chennai"],
        };
      if (!r.results.length) return { reply: r.note || "I couldn't find matching places nearby.", suggestions: ["Try a larger radius", "Plan a trip in Guwahati"] };
      const label = cats.length ? cats.map((c) => CATEGORIES[c].label.toLowerCase()).join(" & ") : "things to do";
      const lines = (r.results as any[]).slice(0, 6).map((p) => `**${p.name}** — ${p.distance_km} km · ${p.safety}`);
      return {
        reply: `Top ${label} around **${r.around}**:\n${bullets(lines)}\n\nTap a card to add it to your itinerary or get directions.`,
        suggestions: ["Plan a day with these", ...(cats.includes("food") ? ["Historic places nearby"] : ["Food nearby"]), "Is it safe at night?"],
      };
    }

    case "numbers": {
      await runTool("get_emergency_info", {}, ctx);
      return { reply: `**Emergency numbers (India)**\n${bullets(EMERGENCY_NUMBERS_IN.map((n) => `${n.label}: **${n.number}**`))}`, suggestions: ["Nearest hospital", "Safety tips"] };
    }

    case "nearby_help": {
      const kind = text.match(RX.nearbyHelp)?.[1] ?? "police station";
      const r = await runTool("find_nearby_help", { kind }, ctx);
      return {
        reply: `Here's a map of the nearest **${kind}**${r.used_current_location ? " around your location" : " (enable location for better results)"}. In an emergency call **112**.`,
        suggestions: ["Emergency numbers", "Is it safe here?"],
      };
    }

    case "app_help": {
      const t = text.toLowerCase();
      if (/e-?fir/.test(t)) {
        await runTool("show_app_action", { action: "efir" }, ctx);
        return { reply: "**e-FIR**: open the e-FIR page, describe what happened (when, where, items/people involved), attach your location and submit. You'll see its status in your list. For emergencies call 112 first.", suggestions: [] };
      }
      if (/check-?in/.test(t)) {
        await runTool("show_app_action", { action: "checkin" }, ctx);
        return { reply: "**Safe Check-in**: set a timer (e.g. 60 min) before a trek or night ride. If you don't tap *I'm safe* in time, Tour Secure raises an alert with your last location for your emergency contacts and the control room.", suggestions: [] };
      }
      if (/digital id/.test(t)) {
        await runTool("show_app_action", { action: "digital_id" }, ctx);
        return { reply: "**Digital ID**: create a time-bound tourist ID for your trip dates. It produces a QR code officials can scan to verify you; you can extend or revoke it any time.", suggestions: [] };
      }
      if (/contact/.test(t)) {
        await runTool("show_app_action", { action: "contacts" }, ctx);
        return { reply: "Add up to 5 **emergency contacts** in the Safety Center. When you send SOS you get a live-tracking link to share with them in one tap.", suggestions: [] };
      }
      await runTool("show_app_action", { action: "sos" }, ctx);
      return { reply: "**SOS**: tap the red button on Home. You get 5 seconds to cancel; then an alert with your live location is raised and you get a tracking link to share with your contacts.", suggestions: [] };
    }

    case "tips":
      return { reply: `**Travel safety tips**\n${bullets(SAFETY_TIPS)}`, suggestions: ["Emergency numbers", "Is it safe here?"] };

    case "greeting":
      return {
        reply: `Hi${name ? ` ${name}` : ""}! 👋 I'm your Tour Secure assistant. I can recommend places by category (historic, food, fun, entertainment…), plan day-by-day trips, check how safe an area is, and help in emergencies.`,
        suggestions: DEFAULT_SUGGESTIONS,
      };

    case "thanks":
      return { reply: "You're welcome! Stay safe and enjoy your trip. 🌏", suggestions: DEFAULT_SUGGESTIONS };

    default:
      return {
        reply:
          "I can help with:\n" +
          bullets([
            "**Recommendations** — “historic places near me”, “food in Shillong”",
            "**Trip plans** — “plan 2 days in Jaipur”",
            "**Safety** — “is MG Marg safe at night?”",
            "**Emergencies** — numbers, nearest police/hospital, SOS",
          ]),
        suggestions: DEFAULT_SUGGESTIONS,
      };
  }
}

function isoDate(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
