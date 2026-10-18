// frontend/src/lib/categories.ts
// Single source of truth for recommendation categories on the client
// (labels, emoji, colours). Tailwind classes are written out in full so the
// JIT compiler picks them up.

export type CategoryId =
  | "historic"
  | "entertainment"
  | "fun"
  | "food"
  | "nature"
  | "spiritual"
  | "shopping";

export type CategoryUi = {
  id: CategoryId;
  label: string;
  short: string;
  emoji: string;
  color: string; // hex, used for map markers
  chip: string; // tailwind classes when selected
  soft: string; // tailwind classes for subtle badges
};

export const CATEGORY_UI: Record<CategoryId, CategoryUi> = {
  historic: { id: "historic", label: "Historic & Heritage", short: "Historic", emoji: "🏛️", color: "#b45309", chip: "bg-amber-700 text-white border-amber-700", soft: "bg-amber-50 text-amber-800 border-amber-200" },
  entertainment: { id: "entertainment", label: "Entertainment", short: "Entertainment", emoji: "🎭", color: "#7c3aed", chip: "bg-violet-600 text-white border-violet-600", soft: "bg-violet-50 text-violet-800 border-violet-200" },
  fun: { id: "fun", label: "Fun & Adventure", short: "Fun", emoji: "🎢", color: "#db2777", chip: "bg-pink-600 text-white border-pink-600", soft: "bg-pink-50 text-pink-800 border-pink-200" },
  food: { id: "food", label: "Food & Drink", short: "Food", emoji: "🍛", color: "#ea580c", chip: "bg-orange-600 text-white border-orange-600", soft: "bg-orange-50 text-orange-800 border-orange-200" },
  nature: { id: "nature", label: "Nature & Outdoors", short: "Nature", emoji: "🌿", color: "#16a34a", chip: "bg-green-600 text-white border-green-600", soft: "bg-green-50 text-green-800 border-green-200" },
  spiritual: { id: "spiritual", label: "Spiritual", short: "Spiritual", emoji: "🛕", color: "#0891b2", chip: "bg-cyan-600 text-white border-cyan-600", soft: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  shopping: { id: "shopping", label: "Shopping & Markets", short: "Shopping", emoji: "🛍️", color: "#2563eb", chip: "bg-blue-600 text-white border-blue-600", soft: "bg-blue-50 text-blue-800 border-blue-200" },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_UI) as CategoryId[];
export const DEFAULT_CATEGORIES: CategoryId[] = ["historic", "entertainment", "fun", "food"];

export function catUi(id: string | null | undefined): CategoryUi | null {
  return id && id in CATEGORY_UI ? CATEGORY_UI[id as CategoryId] : null;
}

export type SafetyLevel = "safe" | "moderate" | "caution" | "unsafe";

export const SAFETY_UI: Record<SafetyLevel, { label: string; cls: string; dot: string }> = {
  safe: { label: "Safe", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  moderate: { label: "Moderate", cls: "bg-yellow-50 text-yellow-800 border-yellow-200", dot: "bg-yellow-500" },
  caution: { label: "Caution", cls: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  unsafe: { label: "Unsafe", cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
};

export function priceLabel(p: number) {
  return p <= 0 ? "Free" : "₹".repeat(Math.min(3, p));
}

export function bestTimeLabel(t: string) {
  return t === "any" ? "Any time" : t.charAt(0).toUpperCase() + t.slice(1);
}

export function fmtDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function fmtDuration(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
