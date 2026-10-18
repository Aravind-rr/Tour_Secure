// frontend/src/pages/Explore.tsx
// Category-wise, safety-aware recommendations:
//   • Near me            – based on current / searched location
//   • From my itinerary  – ideas around each saved stop + "for you" from the trip's interest profile
//   • Plan a trip        – auto-generated day-by-day plan you can save to the itinerary
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Compass, Route as RouteIcon, ListChecks, Sparkles, ShieldCheck, Bot } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Loading from "@/components/ui/Loading";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { useGeolocation } from "@/hooks/useGeolocation";
import CategoryChips from "@/components/explore/CategoryChips";
import PlaceCardView from "@/components/explore/PlaceCard";
import PlacesMap from "@/components/explore/PlacesMap";
import PlanView from "@/components/explore/PlanView";
import LocationBar from "@/components/explore/LocationBar";
import SafetyBadge from "@/components/explore/SafetyBadge";
import { CATEGORY_UI, DEFAULT_CATEGORIES, catUi, type CategoryId } from "@/lib/categories";
import {
  getItineraryRecs,
  getNearby,
  localHour,
  planTrip,
  todayISO,
  type ItineraryRecs,
  type NearbyResponse,
  type PlaceCard,
  type TripPlan,
} from "@/services/recommendations";
import { getProfile } from "@/services/safetyCenter";

type Tab = "near" | "itinerary" | "plan";
const TIMES: Array<{ v: string; label: string }> = [
  { v: "now", label: "Right now" },
  { v: "9", label: "Morning" },
  { v: "14", label: "Afternoon" },
  { v: "18", label: "Evening" },
  { v: "22", label: "Night" },
];

const DEFAULT_ORIGIN = { lat: 13.0827, lng: 80.2707 }; // Chennai (matches Home default)

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "near";
  const setTab = (t: Tab) => setParams((p) => { p.set("tab", t); return p; }, { replace: true });

  const { user } = useAuth();
  const geo = useGeolocation();
  const origin = geo.coords ?? DEFAULT_ORIGIN;
  const originLabel = geo.coords ? geo.label : "Chennai (default)";

  const [cats, setCats] = useState<CategoryId[]>(DEFAULT_CATEGORIES);
  const [avoidUnsafe, setAvoidUnsafe] = useState(true);
  const [time, setTime] = useState("now");
  const hour = time === "now" ? localHour() : Number(time);

  // pull saved interests once (signed-in users)
  useEffect(() => {
    if (!user) return;
    getProfile()
      .then((p) => {
        if (p.interests?.length) setCats(p.interests);
        setAvoidUnsafe(p.avoidUnsafe ?? true);
      })
      .catch(() => {});
  }, [user]);

  // first visit with no remembered location: try GPS once
  useEffect(() => {
    if (!geo.coords) geo.locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Compass className="text-neutral-400" /> Explore
          </h1>
          <p className="mt-1 text-sm text-neutral-600">Safety-aware recommendations by category — near you, around your itinerary, or as a ready-made plan.</p>
        </div>
        <Link to="/assistant" className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50">
          <Bot size={16} /> Ask the AI assistant
        </Link>
      </div>

      <LocationBar coords={geo.coords} label={originLabel} status={geo.status} onLocate={geo.locate} onManual={geo.setManual} />
      {geo.status === "denied" && <p className="-mt-6 text-xs text-orange-700">Location permission denied — search a place instead.</p>}

      <div className="flex flex-wrap gap-2 border-b" role="tablist">
        {(
          [
            ["near", "Near me", Compass],
            ["itinerary", "From my itinerary", ListChecks],
            ["plan", "Plan a trip", RouteIcon],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm">
        <CategoryChips value={cats} onChange={setCats} />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {tab !== "plan" && (
            <label className="flex items-center gap-2">
              <span className="text-neutral-500">Time</span>
              <Select value={time} onChange={(e) => setTime(e.target.value)} className="py-1 text-sm">
                {TIMES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={avoidUnsafe} onChange={(e) => setAvoidUnsafe(e.target.checked)} className="rounded" />
            <ShieldCheck size={16} className="text-emerald-600" /> Hide low-safety places
          </label>
        </div>
      </div>

      {tab === "near" && <NearTab origin={origin} originLabel={originLabel} cats={cats} hour={hour} avoidUnsafe={avoidUnsafe} />}
      {tab === "itinerary" && <ItineraryTab cats={cats} hour={hour} avoidUnsafe={avoidUnsafe} focusItem={params.get("item") ?? undefined} />}
      {tab === "plan" && <PlanTab origin={geo.coords} originLabel={originLabel} cats={cats} avoidUnsafe={avoidUnsafe} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function NearTab({ origin, originLabel, cats, hour, avoidUnsafe }: { origin: { lat: number; lng: number }; originLabel: string; cats: CategoryId[]; hour: number; avoidUnsafe: boolean }) {
  const { notify } = useToast();
  const [radius, setRadius] = useState(15);
  const [data, setData] = useState<NearbyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getNearby({ origin, categories: cats, radiusKm: radius, hour, avoidUnsafe, limit: 24, perCategory: 6 }));
    } catch (e: any) {
      notify({ tone: "error", message: e?.response?.data?.error || e?.message || "Failed to load recommendations" });
    } finally {
      setLoading(false);
    }
  }, [origin.lat, origin.lng, cats.join(","), radius, hour, avoidUnsafe]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const groupEntries = useMemo(() => Object.entries(data?.groups ?? {}).filter(([, v]) => v.length) as Array<[CategoryId, PlaceCard[]]>, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {data?.originSafety && (
            <span className="inline-flex items-center gap-2">
              Area safety <SafetyBadge level={data.originSafety.level} score={data.originSafety.score} />
            </span>
          )}
          {data && (
            <span className="text-neutral-500">
              {data.total} places within {data.radiusKm} km{data.expanded ? " (search widened)" : ""} · sources: {data.sources.join(", ")}
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">Radius</span>
          <Select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="py-1 text-sm">
            {[5, 10, 15, 25, 50].map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </Select>
        </label>
      </div>

      {data?.originSafety?.advice?.length ? (
        <ul className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-900">
          {data.originSafety.advice.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      ) : null}

      {loading && !data ? (
        <Loading label="Finding places…" />
      ) : !data || data.items.length === 0 ? (
        <Card>
          <CardBody>
            <div className="text-sm text-neutral-600">{data?.hint ?? "No places match these filters. Try more categories or a larger radius."}</div>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-2 lg:order-2">
              <div className="lg:sticky lg:top-20">
                <PlacesMap origin={origin} places={data.items} selectedId={selected} onSelect={(p) => setSelected(p.id)} height={480} />
                <p className="mt-2 text-xs text-neutral-500">Marker colour = category. Blue dot = {originLabel}.</p>
              </div>
            </div>
            <div className="lg:col-span-3 lg:order-1">
              <h2 className="section-title mb-3 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" /> Top picks for you
              </h2>
              <div className={`grid gap-3 sm:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
                {data.items.slice(0, 8).map((p) => (
                  <PlaceCardView key={p.id} place={p} selected={p.id === selected} onSelect={(x) => setSelected(x.id)} />
                ))}
              </div>
            </div>
          </div>

          {groupEntries.map(([cat, list]) => (
            <section key={cat} aria-labelledby={`cat-${cat}`}>
              <h2 id={`cat-${cat}`} className="section-title mb-3">
                {CATEGORY_UI[cat]?.emoji} {CATEGORY_UI[cat]?.label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((p) => (
                  <PlaceCardView key={p.id} place={p} compact selected={p.id === selected} onSelect={(x) => setSelected(x.id)} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ItineraryTab({ cats, hour, avoidUnsafe, focusItem }: { cats: CategoryId[]; hour: number; avoidUnsafe: boolean; focusItem?: string }) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [data, setData] = useState<ItineraryRecs | null>(null);
  const [loading, setLoading] = useState(false);
  const [useProfile, setUseProfile] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setData(
        await getItineraryRecs({
          categories: useProfile ? [] : cats,
          hour,
          avoidUnsafe,
          perStop: 3,
          ...(focusItem ? { itemId: focusItem } : {}),
        })
      );
    } catch (e: any) {
      notify({ tone: "error", message: e?.response?.data?.error || e?.message || "Failed to load" });
    } finally {
      setLoading(false);
    }
  }, [user, cats.join(","), hour, avoidUnsafe, useProfile, focusItem]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const h = () => load();
    window.addEventListener("itinerary:changed", h);
    return () => window.removeEventListener("itinerary:changed", h);
  }, [load]);

  if (!user)
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-neutral-700">
            <Link to="/login" className="font-medium underline">
              Sign in
            </Link>{" "}
            to get suggestions based on your saved itinerary.
          </p>
        </CardBody>
      </Card>
    );

  if (loading && !data) return <Loading label="Reading your itinerary…" />;
  if (!data) return null;

  if (data.itemCount === 0)
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-neutral-700">Your itinerary is empty. Add places from <b>Near me</b>, or generate a full trip in <b>Plan a trip</b>.</p>
        </CardBody>
      </Card>
    );

  const allStopPlaces = data.stops.flatMap((s) => s.suggestions);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-neutral-500">Your trip leans towards</span>
            {data.profile.top.length ? (
              data.profile.top.map((c) => (
                <span key={c} className={`rounded-full border px-2 py-0.5 text-xs font-medium ${catUi(c)?.soft}`}>
                  {catUi(c)?.emoji} {catUi(c)?.short} {Math.round((data.profile.weights[c] ?? 0) * 100)}%
                </span>
              ))
            ) : (
              <span className="text-neutral-500">— not enough info yet</span>
            )}
            {data.profile.gaps.length > 0 && (
              <>
                <span className="ml-2 text-neutral-500">· Not covered yet:</span>
                {data.profile.gaps.map((c) => (
                  <span key={c} className="rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs text-neutral-600">
                    {catUi(c)?.emoji} {catUi(c)?.short}
                  </span>
                ))}
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useProfile} onChange={(e) => setUseProfile(e.target.checked)} className="rounded" />
            Use my trip's interests (uncheck to use the category filter above)
          </label>
        </CardBody>
      </Card>

      {data.forYou.length > 0 && (
        <section>
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" /> For you, based on your itinerary
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.forYou.slice(0, 6).map((p) => (
              <PlaceCardView key={p.id} place={p} />
            ))}
          </div>
        </section>
      )}

      {data.gapIdeas.length > 0 && (
        <section>
          <h2 className="section-title mb-1">Add some variety</h2>
          <p className="mb-3 text-sm text-neutral-600">Categories your trip doesn't include yet: {data.profile.gapLabels.join(", ")}.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.gapIdeas.map((p) => (
              <PlaceCardView key={p.id} place={p} compact />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="section-title">Ideas near each stop</h2>
        {allStopPlaces.length > 0 && (
          <PlacesMap places={allStopPlaces} origin={null} height={340} />
        )}
        {data.stops.map((s) => (
          <Card key={s.item.id}>
            <CardHeader
              title={s.item.title}
              actions={s.safety ? <SafetyBadge level={s.safety.level} score={s.safety.score} /> : <span className="text-xs text-neutral-500">Location unknown</span>}
            />
            <CardBody>
              <div className="mb-3 text-xs text-neutral-500">
                {s.item.date ?? "No date"}
                {s.item.time ? ` ${s.item.time}` : ""} · {s.resolved?.label ?? s.item.location ?? "—"}
              </div>
              {!s.resolved ? (
                <p className="text-sm text-neutral-600">Add a location (city or landmark) to this item to get nearby ideas.</p>
              ) : s.suggestions.length === 0 ? (
                <p className="text-sm text-neutral-600">No matching places nearby.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {s.suggestions.slice(0, 3).map((p) => (
                    <PlaceCardView key={p.id} place={p} compact defaultDate={s.item.date ?? undefined} />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PlanTab({ origin, originLabel, cats, avoidUnsafe }: { origin: { lat: number; lng: number } | null; originLabel: string; cats: CategoryId[]; avoidUnsafe: boolean }) {
  const { notify } = useToast();
  const [dest, setDest] = useState("");
  const [days, setDays] = useState(2);
  const [pace, setPace] = useState<"relaxed" | "balanced" | "packed">("balanced");
  const [startDate, setStartDate] = useState(todayISO());
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!dest.trim() && !origin) {
      notify({ tone: "warning", message: "Enter a destination or share your location." });
      return;
    }
    setBusy(true);
    try {
      const p = await planTrip({
        ...(dest.trim() ? { location: dest.trim() } : { origin: origin! }),
        days,
        categories: cats,
        pace,
        startDate,
        avoidUnsafe,
      });
      setPlan(p);
    } catch (err: any) {
      notify({ tone: "error", message: err?.response?.data?.error || err?.message || "Could not plan the trip" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <form onSubmit={generate} className="grid gap-3 md:grid-cols-6 md:items-end">
            <label className="md:col-span-2">
              <span className="mb-1 block text-xs text-neutral-500">Destination</span>
              <Input value={dest} onChange={(e) => setDest(e.target.value)} placeholder={origin ? `${originLabel} (leave empty)` : "e.g. Jaipur"} />
            </label>
            <label>
              <span className="mb-1 block text-xs text-neutral-500">Days</span>
              <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {d} day{d > 1 ? "s" : ""}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-neutral-500">Start</span>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-xs text-neutral-500">Pace</span>
              <Select value={pace} onChange={(e) => setPace(e.target.value as any)} className="w-full">
                <option value="relaxed">Relaxed (4/day)</option>
                <option value="balanced">Balanced (5/day)</option>
                <option value="packed">Packed (6/day)</option>
              </Select>
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? "Planning…" : "Generate plan"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">Uses the categories selected above. Meals are added automatically; low-safety areas are skipped when the shield toggle is on.</p>
        </CardBody>
      </Card>

      {busy && !plan && <Loading label="Building your itinerary…" />}
      {plan && (
        <Card>
          <CardHeader title={`Your ${plan.days.length}-day plan${plan.label ? ` · ${plan.label}` : ""}`} actions={<span className="text-xs text-neutral-500">{plan.totalStops} stops · ~{plan.totalKm} km</span>} />
          <CardBody>
            <PlanView plan={plan} />
          </CardBody>
        </Card>
      )}
      {plan && plan.alternatives.length > 0 && (
        <section>
          <h2 className="section-title mb-3">Swap-in alternatives</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plan.alternatives.map((p) => (
              <PlaceCardView key={p.id} place={p} compact defaultDate={startDate} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
