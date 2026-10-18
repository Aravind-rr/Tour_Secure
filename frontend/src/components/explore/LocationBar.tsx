import { useState } from "react";
import { LocateFixed, Search, MapPin, Loader2 } from "lucide-react";
import { geocode } from "@/services/recommendations";
import type { Coords, GeoStatus } from "@/hooks/useGeolocation";
import { useToast } from "@/components/ui/Toast";

type Props = {
  coords: Coords | null;
  label: string;
  status: GeoStatus;
  onLocate: () => void;
  onManual: (c: Coords, label: string) => void;
};

const QUICK = ["Chennai", "Guwahati", "Shillong", "Gangtok", "Delhi", "Jaipur", "Mumbai", "Kolkata", "Agra"];

/** Shows the active location and lets the user search a place or use GPS. */
export default function LocationBar({ coords, label, status, onLocate, onManual }: Props) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const { notify } = useToast();

  async function search(text = q) {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await geocode(text.trim());
      if (!r) notify({ tone: "warning", message: `Couldn't find "${text}". Try a city name.` });
      else {
        onManual({ lat: r.lat, lng: r.lng }, r.label);
        setQ("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm md:flex-row md:items-center">
      <div className="flex min-w-0 items-center gap-2 md:w-72">
        <MapPin size={18} className="shrink-0 text-blue-600" aria-hidden />
        <div className="min-w-0">
          <div className="text-xs text-neutral-500">Exploring around</div>
          <div className="truncate font-semibold" title={label}>
            {coords ? label || `${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}` : "Choose a location"}
          </div>
        </div>
      </div>
      <form
        className="flex flex-1 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a city or landmark (e.g. Shillong, Hawa Mahal)"
            className="w-full rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-sm focus:border-black focus:ring-1 focus:ring-black"
            aria-label="Search location"
            list="ts-quick-cities"
          />
          <datalist id="ts-quick-cities">
            {QUICK.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <button type="submit" disabled={busy} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Go"}
        </button>
        <button
          type="button"
          onClick={onLocate}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
          title="Use my current location"
        >
          {status === "locating" ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />} <span className="hidden sm:inline">My location</span>
        </button>
      </form>
    </div>
  );
}
