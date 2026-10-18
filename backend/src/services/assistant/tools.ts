// backend/src/services/assistant/tools.ts
// Tools the assistant can call. Shared by the Claude engine (tool use) and
// the offline rule-based engine, so both give grounded answers.

import Itinerary from "../../models/itinerary.model";
import { CATEGORIES, parseCategories, classifyText } from "../../recommend/categories";
import type { PlaceCard } from "../../recommend/engine";
import { isValidLatLng } from "../../recommend/geo";
import { planTripService, recommendNearby } from "../recommend.service";
import { geocode } from "../geocode.service";
import { safetyAt } from "../safetyLookup.service";

export type AssistantAction =
  | { type: "sos"; label: string }
  | { type: "call"; label: string; href: string }
  | { type: "link"; label: string; href: string }
  | { type: "route"; label: string; to: string };

export type ToolContext = {
  userId?: string;
  userName?: string;
  lat?: number;
  lng?: number;
  hour?: number;
  collected: {
    cards: PlaceCard[];
    plan?: any;
    actions: AssistantAction[];
    itineraryChanged?: boolean;
  };
};

/* ------------------------------------------------------------------ */
/* static reference data                                               */
/* ------------------------------------------------------------------ */

export const EMERGENCY_NUMBERS_IN = [
  { label: "All emergencies (ERSS)", number: "112" },
  { label: "Police", number: "100" },
  { label: "Ambulance", number: "108" },
  { label: "Fire", number: "101" },
  { label: "Women helpline", number: "1091" },
  { label: "Tourist helpline (Ministry of Tourism, 24x7)", number: "1800111363" },
  { label: "Child helpline", number: "1098" },
  { label: "Cyber fraud", number: "1930" },
];

export const SAFETY_TIPS = [
  "Keep digital + paper copies of your passport/ID and visa; carry a copy, store the original safely.",
  "Share your live location or start a Safe Check-in timer before night travel or treks.",
  "Use prepaid / app-based taxis; note the vehicle number and share it with someone.",
  "Avoid isolated, poorly lit areas after dark; stay on main roads.",
  "Beware of common scams: 'closed attraction' detours, overpriced gem deals, fake guides.",
  "Keep emergency contacts saved in Tour Secure so SOS can reach them quickly.",
];

/* ------------------------------------------------------------------ */
/* JSON-schema tool definitions (Anthropic Messages API format)        */
/* ------------------------------------------------------------------ */

const categoryEnum = Object.keys(CATEGORIES);

export const TOOL_DEFS = [
  {
    name: "get_safety_info",
    description:
      "Get the Tour Secure safety estimate (0-100, higher is safer) for a place or coordinates, including geo-fenced risk zones and advice. Omit all arguments to use the user's current location.",
    input_schema: {
      type: "object",
      properties: {
        location: { type: "string", description: "Place or city name, e.g. 'Police Bazaar, Shillong'" },
        lat: { type: "number" },
        lng: { type: "number" },
        hour: { type: "integer", description: "Local hour 0-23 to evaluate (e.g. 22 when the user asks about night). Defaults to now." },
      },
    },
  },
  {
    name: "recommend_places",
    description:
      "Recommend places to visit, ranked by interest match, distance, popularity and area safety. Use for 'what to do/see/eat' questions. Omit location to search around the user.",
    input_schema: {
      type: "object",
      properties: {
        categories: { type: "array", items: { type: "string", enum: categoryEnum }, description: "Categories to include" },
        location: { type: "string", description: "City or area to search around (omit for current location)" },
        radius_km: { type: "number", description: "Search radius in km (default 15)" },
        limit: { type: "integer", description: "Max results (default 6, max 10)" },
      },
    },
  },
  {
    name: "plan_trip",
    description:
      "Build a safety-aware day-by-day itinerary with times, travel distances and meals. Use when the user asks to plan days/a trip.",
    input_schema: {
      type: "object",
      properties: {
        location: { type: "string", description: "Destination city/area (omit for current location)" },
        days: { type: "integer", description: "Number of days, 1-7 (default 1)" },
        categories: { type: "array", items: { type: "string", enum: categoryEnum } },
        pace: { type: "string", enum: ["relaxed", "balanced", "packed"] },
        start_date: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "get_my_itinerary",
    description: "List the signed-in user's saved itinerary items.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_to_itinerary",
    description:
      "Save an item to the signed-in user's itinerary. Only call this when the user explicitly asks to add/save something.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM 24h" },
        location: { type: "string" },
        category: { type: "string", enum: categoryEnum },
        notes: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_emergency_info",
    description: "Indian emergency and helpline numbers plus immediate safety steps.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find_nearby_help",
    description: "Get a map link for the nearest police station, hospital, pharmacy, ATM, embassy, etc. around the user.",
    input_schema: {
      type: "object",
      properties: { kind: { type: "string", description: "e.g. police station, hospital, pharmacy, ATM, embassy, taxi stand" } },
      required: ["kind"],
    },
  },
  {
    name: "show_app_action",
    description:
      "Show the user a button for an in-app feature: sos (emergency alert with live location), efir (file an e-FIR/police report), checkin (safe check-in timer), contacts (emergency contacts), digital_id, explore, itinerary.",
    input_schema: {
      type: "object",
      properties: { action: { type: "string", enum: ["sos", "efir", "checkin", "contacts", "digital_id", "explore", "itinerary"] } },
      required: ["action"],
    },
  },
] as const;

/* ------------------------------------------------------------------ */
/* executors                                                           */
/* ------------------------------------------------------------------ */

async function originFrom(input: any, ctx: ToolContext): Promise<{ lat: number; lng: number; label: string } | null> {
  if (isValidLatLng(input?.lat, input?.lng)) return { lat: Number(input.lat), lng: Number(input.lng), label: "given coordinates" };
  const loc = typeof input?.location === "string" ? input.location.trim() : "";
  if (loc) {
    const g = await geocode(loc);
    if (g) return { lat: g.lat, lng: g.lng, label: g.label };
    return null;
  }
  if (isValidLatLng(ctx.lat, ctx.lng)) return { lat: Number(ctx.lat), lng: Number(ctx.lng), label: "your current location" };
  return null;
}

const APP_ACTIONS: Record<string, AssistantAction> = {
  sos: { type: "sos", label: "🚨 Send SOS alert" },
  efir: { type: "route", label: "📝 File an e-FIR", to: "/efir" },
  checkin: { type: "route", label: "⏱️ Start safe check-in", to: "/safety" },
  contacts: { type: "route", label: "👥 Emergency contacts", to: "/safety" },
  digital_id: { type: "route", label: "🪪 Digital ID", to: "/digital-id" },
  explore: { type: "route", label: "🧭 Explore places", to: "/explore" },
  itinerary: { type: "route", label: "🗓️ My itinerary", to: "/itinerary" },
};

function pushAction(ctx: ToolContext, a: AssistantAction) {
  const key = `${a.type}:${a.label}`;
  if (!ctx.collected.actions.some((x) => `${x.type}:${x.label}` === key)) ctx.collected.actions.push(a);
}

export async function runTool(name: string, input: any, ctx: ToolContext): Promise<any> {
  switch (name) {
    case "get_safety_info": {
      const o = await originFrom(input, ctx);
      if (!o) return { error: "Location unknown. Ask the user for a place name or to enable location." };
      const h = Number(input?.hour);
      const hour = Number.isInteger(h) && h >= 0 && h < 24 ? h : ctx.hour;
      const s = await safetyAt(o.lat, o.lng, hour);
      return {
        place: o.label,
        score: s.score,
        level: s.level,
        basis: s.source,
        confidence: s.confidence,
        zone: s.zone ?? null,
        nearestScoredArea: s.area ?? null,
        night: s.night,
        advice: s.advice,
      };
    }

    case "recommend_places": {
      const o = await originFrom(input, ctx);
      if (!o) return { error: "Location unknown. Ask the user which city/area, or to enable location." };
      const r = await recommendNearby({
        origin: o,
        radiusKm: Number(input?.radius_km) || 15,
        categories: parseCategories(input?.categories),
        limit: Math.min(10, Math.max(1, Number(input?.limit) || 6)),
        ...(ctx.hour !== undefined ? { hour: ctx.hour } : {}),
        avoidUnsafe: true,
      });
      ctx.collected.cards = r.items;
      return {
        around: o.label,
        radius_km: r.radiusKm,
        results: r.items.map((p) => ({
          name: p.name,
          city: p.city,
          category: p.category,
          distance_km: p.distanceKm,
          safety: `${p.safety.level} (${p.safety.score}/100)`,
          best_time: p.bestTime,
          typical_visit_mins: p.durationMins,
          about: p.description,
          warnings: p.warnings,
        })),
        note: r.hint ?? (r.items.length ? "Results are shown to the user as cards." : "No results."),
      };
    }

    case "plan_trip": {
      const o = await originFrom(input, ctx);
      if (!o) return { error: "Destination unknown. Ask the user where they want to go." };
      const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.start_date ?? "")) ? String(input.start_date) : undefined;
      const plan = await planTripService({
        origin: o,
        label: o.label,
        days: Number(input?.days) || 1,
        categories: parseCategories(input?.categories),
        pace: input?.pace,
        ...(startDate ? { startDate } : {}),
        avoidUnsafe: true,
      });
      ctx.collected.plan = plan;
      return {
        destination: o.label,
        warnings: plan.warnings,
        days: plan.days.map((d: any) => ({
          day: d.day,
          date: d.date,
          title: d.title,
          stops: d.stops.map((s: any) => `${s.time} ${s.place.name} (${s.place.category}, safety ${s.place.safety.level})`),
        })),
        note: "The full plan with a 'Save to itinerary' button is shown to the user.",
      };
    }

    case "get_my_itinerary": {
      if (!ctx.userId) return { error: "User is not signed in. Suggest signing in to use the itinerary." };
      const items = (await Itinerary.find({ user: ctx.userId }).sort({ date: 1, time: 1 }).limit(50).lean()) as any[];
      pushAction(ctx, APP_ACTIONS.itinerary!);
      return {
        count: items.length,
        items: items.map((i) => ({ title: i.title, date: i.date ?? null, time: i.time ?? null, location: i.location ?? null, category: i.category ?? null, done: !!i.done })),
      };
    }

    case "add_to_itinerary": {
      if (!ctx.userId) return { error: "User is not signed in; cannot save. Suggest signing in." };
      const title = String(input?.title ?? "").trim().slice(0, 200);
      if (!title) return { error: "title required" };
      const doc: any = { title, user: ctx.userId, source: "assistant" };
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(input?.date ?? ""))) doc.date = input.date;
      if (/^\d{1,2}:\d{2}$/.test(String(input?.time ?? ""))) doc.time = String(input.time).padStart(5, "0");
      if (input?.location) doc.location = String(input.location).slice(0, 300);
      if (input?.notes) doc.notes = String(input.notes).slice(0, 2000);
      doc.category = parseCategories([input?.category])[0] ?? classifyText(title)[0];
      if (!doc.category) delete doc.category;
      const g = (doc.location && (await geocode(doc.location))) || (await geocode(title));
      if (g) {
        doc.lat = g.lat;
        doc.lng = g.lng;
      }
      const created = await Itinerary.create(doc);
      ctx.collected.itineraryChanged = true;
      pushAction(ctx, APP_ACTIONS.itinerary!);
      return { ok: true, saved: { id: String(created._id), title, date: doc.date ?? null, time: doc.time ?? null } };
    }

    case "get_emergency_info": {
      pushAction(ctx, { type: "call", label: "📞 Call 112", href: "tel:112" });
      pushAction(ctx, APP_ACTIONS.sos!);
      return {
        numbers: EMERGENCY_NUMBERS_IN,
        immediate_steps: [
          "If in danger, move to a crowded, well-lit place (shop, hotel lobby, police booth).",
          "Call 112 — it connects police, ambulance and fire.",
          "Press SOS in Tour Secure to alert your emergency contacts with live location.",
          "For theft/loss, file an e-FIR afterwards and keep the reference.",
        ],
      };
    }

    case "find_nearby_help": {
      const kind = String(input?.kind || "police station").slice(0, 60);
      const hasLoc = isValidLatLng(ctx.lat, ctx.lng);
      const href = hasLoc
        ? `https://www.google.com/maps/search/${encodeURIComponent(kind)}/@${ctx.lat},${ctx.lng},15z`
        : `https://www.google.com/maps/search/${encodeURIComponent(`${kind} near me`)}`;
      pushAction(ctx, { type: "link", label: `🗺️ Nearest ${kind}`, href });
      return { map_link: href, used_current_location: hasLoc, note: "A map button is shown to the user." };
    }

    case "show_app_action": {
      const a = APP_ACTIONS[String(input?.action)];
      if (!a) return { error: "unknown action" };
      pushAction(ctx, a);
      return { ok: true, shown: a.label };
    }

    default:
      return { error: `Unknown tool ${name}` };
  }
}
