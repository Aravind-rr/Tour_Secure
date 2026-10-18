// backend/src/services/assistant/nlu.ts
// Pure intent detection + slot extraction for the offline assistant.

import { classifyText, parseCategories, type CategoryId } from "../../recommend/categories";

export type Intent =
  | "emergency"
  | "lost"
  | "safety"
  | "plan"
  | "my_itinerary"
  | "add_itinerary"
  | "recommend"
  | "numbers"
  | "nearby_help"
  | "app_help"
  | "tips"
  | "greeting"
  | "thanks"
  | "unknown";

export const RX = {
  emergency:
    /\b(sos|emergency|danger|dangerous situation|attack(ed)?|assault(ed)?|robbed|mugged|harass(ed|ment|ing)?|molest|scared|afraid|being followed|follow(ing|ed) me|accident|injur(ed|y)|bleeding|kidnap|threat(en|ened)?|unconscious|chest pain|bachao|madad|help me now|need help now|call police)\b/i,
  lost: /\b(lost|stolen|missing|theft|stole|pickpocket(ed)?|scam(med)?|fraud|cheated)\b/i,
  safety: /\b(is it safe|how safe|safe to (go|visit|walk|travel)|safety (score|level|of|in|at|near|here|there)|safe (area|place|zone)|risky|risk (level|zone)|unsafe|is .{1,40} safe)\b/i,
  plan: /\b(plan|itinerary for|schedule|day trip|\d+\s*-?\s*days?|weekend|one day|two days|three days)\b/i,
  myItinerary: /\b(my (itinerary|plan|trip|schedule)|what('?s| is) (on )?my (plan|itinerary|schedule))\b/i,
  addItinerary: /\b(add|save|put)\b.+\b(to|in|into|on)\s+(my\s+)?(itinerary|plan|trip|schedule)\b/i,
  recommend:
    /\b(recommend|suggest|suggestion|where (can|should|to)|places?|things to (do|see)|what to (see|do|eat|visit)|best|nearby|near me|around me|visit|explore|attractions?|sightseeing|hungry|eat|food|restaurants?|cafes?|museums?|nightlife|fun|entertainment|historic(al)?|heritage|shopping|temples?)\b/i,
  numbers: /\b(numbers?|helpline|hotline|whom to call|who (do|should) i call|ambulance|fire brigade)\b/i,
  nearbyHelp: /\b(?:nearest|closest|near(?:by)?)\s+(police(?: station)?|hospital|clinic|pharmacy|chemist|atm|embassy|consulate|bus stand|railway station|taxi stand|toilet|restroom)\b/i,
  appHelp: /\b(how (do|can|to) i|how to|what is|explain)\b.*\b(e-?fir|digital id|check-?in|sos|contacts?|heat ?map|tour secure|app)\b/i,
  tips: /\b(tips?|advice|precautions?|scams?|stay safe|safety tips|be careful)\b/i,
  greeting: /^\s*(hi|hello|hey|namaste|vanakkam|good (morning|afternoon|evening)|yo)\b/i,
  thanks: /^\s*(thanks|thank you|thx|ty|great|awesome|cool|ok(ay)?)\b[\s!.]*$/i,
};

export function detectIntent(text: string): Intent {
  const t = text.trim();
  if (!t) return "unknown";
  if (RX.emergency.test(t)) return "emergency";
  if (RX.nearbyHelp.test(t)) return "nearby_help";
  if (RX.lost.test(t)) return "lost";
  if (RX.addItinerary.test(t)) return "add_itinerary";
  if (RX.myItinerary.test(t)) return "my_itinerary";
  if (RX.appHelp.test(t)) return "app_help";
  if (RX.safety.test(t)) return "safety";
  if (RX.plan.test(t) && !/\bplanetarium\b/i.test(t)) return "plan";
  if (RX.numbers.test(t)) return "numbers";
  if (RX.tips.test(t)) return "tips";
  if (RX.recommend.test(t) || classifyText(t).length) return "recommend";
  if (RX.thanks.test(t)) return "thanks";
  if (RX.greeting.test(t)) return "greeting";
  return "unknown";
}

const TRAILING =
  /\b(today|tonight|tomorrow|now|please|pls|for|with|this|next|on|in the|during|and|then|days?|weekend|morning|evening|afternoon|night)\b.*$/i;

/** Pull a place name out of "... in Shillong", "near Red Fort", "plan 2 days in Jaipur". */
export function extractLocation(text: string): string | null {
  if (/\b(near me|around me|nearby|here|my location|current location)\b/i.test(text)) return null;
  // "Is Police Bazaar, Shillong safe at night?" -> "Police Bazaar, Shillong"
  const safeQ = text.match(/\bis\s+(?!it\b|this\b|that\b|there\b|here\b)([a-z][\w.'-]*(?:[\s,]+[\w.'-]+){0,4}?)\s+(?:safe|unsafe|risky|dangerous)\b/i);
  const fromSafeQ = safeQ?.[1] ? safeQ[1].replace(/[?.!,]+$/, "").trim() : null;
  const fromPrep = prepositionLocation(text);
  if (fromSafeQ && fromPrep) return fromPrep.length > fromSafeQ.length ? fromPrep : fromSafeQ;
  return fromSafeQ ?? fromPrep;
}

function prepositionLocation(text: string): string | null {
  const VERB = /^(do|eat|see|visit|go|plan|explore|stay|travel|walk|try|book|get|reach|find)\b/i;
  // 1) Capitalised place names ("in New Delhi", "at Police Bazaar, Shillong")
  const m = text.match(/\b(?:in|at|near|around|to|of|visiting|visit)\s+([A-Z][\w.'-]*(?:[\s,]+[A-Z][\w.'-]*){0,3})/);
  let raw = m?.[1];
  // 2) Lower-case fallback: take the LAST preposition phrase that isn't a verb ("things to do in shillong")
  if (!raw) {
    const all = Array.from(text.matchAll(/\b(?:in|at|near|around|to)\s+(?=([a-z][a-z .'-]{2,40}))/gi)).filter((x) => x[1] && !VERB.test(x[1]));
    raw = all[all.length - 1]?.[1];
  }
  if (!raw) return null;
  const loc = raw.replace(TRAILING, "").replace(/[?.!,]+$/, "").trim();
  if (!loc || loc.length < 3) return null;
  if (/^(my|the|a|an|me|it|this|that|go|eat|see|do|visit|safe)$/i.test(loc)) return null;
  return loc;
}

export function extractDays(text: string): number {
  const m = text.match(/(\d+)\s*-?\s*days?/i);
  if (m) return Math.max(1, Math.min(7, Number(m[1])));
  if (/\bweekend\b/i.test(text)) return 2;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  const w = text.match(/\b(one|two|three|four|five|six|seven)\s+days?\b/i);
  return w ? words[w[1]!.toLowerCase()] ?? 1 : 1;
}

export function extractCategories(text: string): CategoryId[] {
  const direct = parseCategories(
    (text.toLowerCase().match(/\b(historic|history|heritage|entertainment|nightlife|fun|adventure|food|restaurants?|nature|outdoors|spiritual|temples?|shopping|markets?|museums?)\b/g) ?? []).map((w) =>
      w.replace(/s$/, "")
    )
  );
  const cls = classifyText(text);
  return Array.from(new Set<CategoryId>([...direct, ...cls])).slice(0, 4);
}
