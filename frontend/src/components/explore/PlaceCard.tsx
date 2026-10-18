import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, Check, Clock, MapPin, Navigation, AlertTriangle } from "lucide-react";
import { bestTimeLabel, catUi, fmtDistance, fmtDuration, priceLabel } from "@/lib/categories";
import { addPlaceToItinerary, todayISO, type PlaceCard as Place } from "@/services/recommendations";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import SafetyBadge from "./SafetyBadge";

type Props = {
  place: Place;
  selected?: boolean;
  onSelect?: (p: Place) => void;
  compact?: boolean;
  defaultDate?: string;
};

export default function PlaceCard({ place, selected, onSelect, compact = false, defaultDate }: Props) {
  const ui = catUi(place.matchedCategory) ?? catUi(place.category);
  const { user } = useAuth();
  const { notify } = useToast();
  const nav = useNavigate();
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(defaultDate ?? todayISO());
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  async function add() {
    if (!user) {
      nav("/login", { state: { from: { pathname: "/explore" } } });
      return;
    }
    setBusy(true);
    try {
      await addPlaceToItinerary(place, { date });
      setAdded(true);
      setAdding(false);
      notify({ tone: "success", title: "Added to itinerary", message: `${place.name} on ${date}` });
    } catch (e: any) {
      notify({ tone: "error", message: e?.response?.data?.error || e?.message || "Could not add" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`group relative flex flex-col rounded-xl border bg-white transition ${selected ? "ring-2 ring-neutral-900" : "hover:shadow-md"}`}
      onMouseEnter={() => onSelect?.(place)}
    >
      <div className="h-1 rounded-t-xl" style={{ background: ui?.color ?? "#999" }} aria-hidden />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium" style={{ color: ui?.color }}>
              {ui?.emoji} {ui?.short}
            </div>
            <h3 className="mt-0.5 font-semibold leading-snug">
              <button type="button" className="text-left hover:underline" onClick={() => onSelect?.(place)}>
                {place.name}
              </button>
            </h3>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
              <MapPin size={12} aria-hidden /> {place.city || "Nearby"} · {fmtDistance(place.distanceKm)}
            </div>
          </div>
          <SafetyBadge level={place.safety.level} score={place.safety.score} compact />
        </div>

        {!compact && <p className="line-clamp-2 text-sm text-neutral-600">{place.description}</p>}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
          <span className="inline-flex items-center gap-1">
            <Clock size={12} aria-hidden /> {bestTimeLabel(place.bestTime)} · {fmtDuration(place.durationMins)}
          </span>
          <span>{priceLabel(place.price)}</span>
          {place.indoor && <span>Indoor</span>}
        </div>

        {!compact && place.reasons.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {place.reasons.slice(0, 2).map((r) => (
              <li key={r} className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">
                {r}
              </li>
            ))}
          </ul>
        )}
        {place.warnings.length > 0 && (
          <div className="flex items-start gap-1 text-xs text-orange-700">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> {place.warnings[0]}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {added ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Check size={14} /> In your itinerary
            </span>
          ) : adding ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
                aria-label="Visit date"
              />
              <button type="button" disabled={busy} onClick={add} className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60">
                {busy ? "Adding…" : "Add"}
              </button>
              <button type="button" onClick={() => setAdding(false)} className="text-xs text-neutral-500 hover:underline">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (user ? setAdding(true) : add())}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-50"
            >
              <CalendarPlus size={14} aria-hidden /> {user ? "Add to itinerary" : "Sign in to save"}
            </button>
          )}
          <a
            href={place.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            <Navigation size={14} aria-hidden /> Directions
          </a>
        </div>
      </div>
    </article>
  );
}
