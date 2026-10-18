// backend/src/recommend/categories.ts
// Category catalogue + lightweight text / OSM-tag classifiers.
// Pure module (no DB / network) so it can be unit tested in isolation.

export const CATEGORY_IDS = [
  "historic",
  "entertainment",
  "fun",
  "food",
  "nature",
  "spiritual",
  "shopping",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export type CategoryMeta = {
  id: CategoryId;
  label: string;
  emoji: string;
  description: string;
};

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  historic: {
    id: "historic",
    label: "Historic & Heritage",
    emoji: "🏛️",
    description: "Forts, monuments, museums and heritage sites",
  },
  entertainment: {
    id: "entertainment",
    label: "Entertainment",
    emoji: "🎭",
    description: "Cinemas, theatres, live music, shows and nightlife",
  },
  fun: {
    id: "fun",
    label: "Fun & Adventure",
    emoji: "🎢",
    description: "Theme parks, zoos, rides, beaches and activities",
  },
  food: {
    id: "food",
    label: "Food & Drink",
    emoji: "🍛",
    description: "Iconic eateries, street food and cafes",
  },
  nature: {
    id: "nature",
    label: "Nature & Outdoors",
    emoji: "🌿",
    description: "Parks, lakes, waterfalls, viewpoints and wildlife",
  },
  spiritual: {
    id: "spiritual",
    label: "Spiritual",
    emoji: "🛕",
    description: "Temples, churches, mosques, monasteries",
  },
  shopping: {
    id: "shopping",
    label: "Shopping & Markets",
    emoji: "🛍️",
    description: "Bazaars, malls and craft markets",
  },
};

export function isCategory(v: unknown): v is CategoryId {
  return typeof v === "string" && (CATEGORY_IDS as readonly string[]).includes(v);
}

/** Parse "historic,food" | ["historic","food"] into a validated list. */
export function parseCategories(input: unknown): CategoryId[] {
  const raw: string[] = Array.isArray(input)
    ? input.map(String)
    : typeof input === "string"
    ? input.split(",")
    : [];
  const out: CategoryId[] = [];
  for (const r of raw) {
    const v = r.trim().toLowerCase();
    const mapped = CATEGORY_ALIASES[v] ?? v;
    if (isCategory(mapped) && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

const CATEGORY_ALIASES: Record<string, CategoryId> = {
  history: "historic",
  heritage: "historic",
  historical: "historic",
  museum: "historic",
  museums: "historic",
  monuments: "historic",
  entertainments: "entertainment",
  nightlife: "entertainment",
  shows: "entertainment",
  adventure: "fun",
  activities: "fun",
  kids: "fun",
  family: "fun",
  eat: "food",
  eating: "food",
  restaurants: "food",
  restaurant: "food",
  cuisine: "food",
  outdoors: "nature",
  parks: "nature",
  religious: "spiritual",
  temples: "spiritual",
  temple: "spiritual",
  markets: "shopping",
  market: "shopping",
  shop: "shopping",
};

/** Keyword table used by the text classifier (title / notes / chat). */
const KEYWORDS: Record<CategoryId, string[]> = {
  historic: [
    "fort", "palace", "museum", "monument", "heritage", "history", "historic",
    "historical", "tomb", "ruins", "memorial", "mahal", "minar", "caves", "cave",
    "archaeological", "archaeology", "colonial", "citadel", "old city", "gate", "observatory",
  ],
  entertainment: [
    "cinema", "movie", "film", "theatre", "theater", "concert", "live music",
    "show", "nightlife", "club", "pub", "bar", "comedy", "drama", "dance",
    "performance", "gig", "planetarium", "light and sound", "entertainment",
  ],
  fun: [
    "theme park", "amusement", "water park", "zoo", "aquarium", "ride", "rides",
    "adventure", "trek", "trekking", "rafting", "paragliding", "boating", "boat",
    "cruise", "ropeway", "cable car", "beach", "kayak", "zipline", "game",
    "bowling", "go kart", "safari", "fun", "kids",
  ],
  food: [
    "food", "eat", "restaurant", "cafe", "café", "coffee", "breakfast", "lunch",
    "dinner", "brunch", "street food", "biryani", "dosa", "idli", "thali",
    "momo", "momos", "chaat", "dessert", "sweets", "bakery", "dhaba", "cuisine",
    "snack", "tea", "chai", "foodie", "dine", "dining",
  ],
  nature: [
    "park", "garden", "lake", "waterfall", "falls", "hill", "peak", "valley",
    "viewpoint", "view point", "sunset", "sunrise", "forest", "wildlife",
    "national park", "sanctuary", "river", "canyon", "nature", "hike", "lagoon",
  ],
  spiritual: [
    "temple", "mandir", "church", "cathedral", "basilica", "mosque", "masjid",
    "dargah", "gurudwara", "monastery", "gompa", "stupa", "chorten", "shrine",
    "ashram", "pilgrim", "puja", "prayer", "spiritual",
  ],
  shopping: [
    "shopping", "shop", "market", "bazaar", "bazar", "mall", "souvenir",
    "handicraft", "crafts", "boutique", "haat", "emporium",
  ],
};

/**
 * Classify free text into categories with a confidence-like weight.
 * Returns categories sorted by match strength (strongest first).
 */
export function classifyText(text: string | undefined | null): CategoryId[] {
  const t = ` ${String(text || "").toLowerCase()} `;
  if (!t.trim()) return [];
  const hits: Array<[CategoryId, number]> = [];
  for (const id of CATEGORY_IDS) {
    let n = 0;
    for (const kw of KEYWORDS[id]) {
      // whole-word match, tolerating simple plurals ("forts", "beaches")
      const re = new RegExp(`(^|[^a-z])${escapeRegExp(kw)}(s|es)?([^a-z]|$)`, "i");
      if (re.test(t)) n += kw.includes(" ") ? 2 : 1;
    }
    if (n > 0) hits.push([id, n]);
  }
  return hits.sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Map OpenStreetMap tags to one of our categories (or null to drop). */
export function categoryFromOsmTags(tags: Record<string, string | undefined>): CategoryId | null {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  const leisure = tags.leisure;
  const historic = tags.historic;
  const shop = tags.shop;
  const natural = tags.natural;

  if (amenity === "place_of_worship") return "spiritual";
  if (historic || tourism === "museum" || tourism === "gallery") return "historic";
  if (["restaurant", "cafe", "fast_food", "food_court", "ice_cream"].includes(amenity || ""))
    return "food";
  if (["cinema", "theatre", "nightclub", "arts_centre", "planetarium", "pub", "bar"].includes(amenity || ""))
    return "entertainment";
  if (
    ["theme_park", "zoo", "aquarium"].includes(tourism || "") ||
    ["amusement_arcade", "water_park", "bowling_alley", "miniature_golf", "beach_resort"].includes(leisure || "")
  )
    return "fun";
  if (
    ["park", "garden", "nature_reserve"].includes(leisure || "") ||
    ["viewpoint"].includes(tourism || "") ||
    ["beach", "waterfall", "peak", "water"].includes(natural || "")
  )
    return "nature";
  if (shop === "mall" || amenity === "marketplace" || shop === "department_store" || shop === "gift")
    return "shopping";
  if (tourism === "attraction") return "historic";
  return null;
}
