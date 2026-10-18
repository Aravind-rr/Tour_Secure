import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, Car, Check, Navigation } from "lucide-react";
import { catUi, fmtDistance, fmtDuration } from "@/lib/categories";
import { savePlanToItinerary, type TripPlan } from "@/services/recommendations";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import SafetyBadge from "./SafetyBadge";
import PlacesMap from "./PlacesMap";

export default function PlanView({ plan, showMap = true, compact = false }: { plan: TripPlan; showMap?: boolean; compact?: boolean }) {
  const [day, setDay] = useState(plan.days[0]?.day ?? 1);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const { notify } = useToast();
  const nav = useNavigate();

  const current = plan.days.find((d) => d.day === day) ?? plan.days[0];
  const route = useMemo(
    () => (current ? [plan.origin, ...current.stops.map((s) => ({ lat: s.place.lat, lng: s.place.lng }))] : []),
    [current, plan.origin]
  );

  async function save(only?: number) {
    if (!user) {
      nav("/login", { state: { from: { pathname: "/explore" } } });
      return;
    }
    const key = only === undefined ? "all" : String(only);
    setSaving(key);
    try {
      const n = await savePlanToItinerary(plan, only);
      setSaved((s) => ({ ...s, [key]: true }));
      notify({ tone: "success", title: "Saved", message: `${n} stop(s) added to your itinerary.` });
    } catch (e: any) {
      notify({ tone: "error", message: e?.response?.data?.error || e?.message || "Could not save plan" });
    } finally {
      setSaving(null);
    }
  }

  if (!plan.days.length || !current) return <div className="text-sm text-neutral-600">No plan could be generated.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {plan.days.map((d) => (
          <button
            key={d.day}
            type="button"
            onClick={() => setDay(d.day)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${d.day === day ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white hover:bg-neutral-50"}`}
          >
            Day {d.day}
            {d.date ? <span className="ml-1 opacity-70">· {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span> : null}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => save()}
          disabled={!!saving || saved.all}
          className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {saved.all ? <Check size={16} /> : <CalendarPlus size={16} />} {saved.all ? "Saved" : saving === "all" ? "Saving…" : user ? "Save whole trip" : "Sign in to save"}
        </button>
      </div>

      {plan.warnings.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">{plan.warnings.join(" ")}</div>
      )}

      <div className={`grid gap-4 ${showMap ? "lg:grid-cols-5" : ""}`}>
        <section className={showMap ? "lg:col-span-3" : ""} aria-label={`Day ${current.day} plan`}>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">
              Day {current.day}: {current.title}
            </h3>
            <span className="text-xs text-neutral-500">
              {current.stops.length} stops · ~{current.totalKm} km
            </span>
          </div>
          <ol className="relative space-y-3 border-l-2 border-neutral-200 pl-5">
            {current.stops.map((s, i) => {
              const ui = catUi(s.place.matchedCategory) ?? catUi(s.place.category);
              return (
                <li key={`${s.place.id}-${i}`} className="relative">
                  <span className="absolute -left-[27px] top-3 h-3 w-3 rounded-full border-2 border-white" style={{ background: ui?.color }} aria-hidden />
                  {s.travelMins > 0 && !compact && (
                    <div className="mb-1 flex items-center gap-1 text-[11px] text-neutral-500">
                      <Car size={12} aria-hidden /> {fmtDistance(s.travelKmFromPrev)} · ~{s.travelMins} min
                    </div>
                  )}
                  <div className="rounded-xl border bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-neutral-500">
                          {s.time}–{s.endTime} · <span style={{ color: ui?.color }}>{s.note}</span>
                        </div>
                        <div className="font-semibold">{s.place.name}</div>
                        {!compact && <p className="mt-0.5 line-clamp-2 text-sm text-neutral-600">{s.place.description}</p>}
                      </div>
                      <SafetyBadge level={s.place.safety.level} score={s.place.safety.score} compact />
                    </div>
                    {!compact && (
                      <div className="mt-2 flex items-center gap-3 text-xs text-neutral-600">
                        <span>{fmtDuration(s.place.durationMins)}</span>
                        <a href={s.place.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                          <Navigation size={12} aria-hidden /> Directions
                        </a>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {plan.days.length > 1 && (
            <button
              type="button"
              onClick={() => save(current.day)}
              disabled={!!saving || saved[String(current.day)] || saved.all}
              className="mt-3 text-sm font-medium text-neutral-700 underline-offset-2 hover:underline disabled:opacity-60"
            >
              {saved[String(current.day)] || saved.all ? "Day saved ✓" : `Save only day ${current.day}`}
            </button>
          )}
        </section>
        {showMap && (
          <div className="lg:col-span-2">
            <PlacesMap origin={plan.origin} places={current.stops.map((s) => s.place)} route={route} height={460} />
          </div>
        )}
      </div>
    </div>
  );
}
