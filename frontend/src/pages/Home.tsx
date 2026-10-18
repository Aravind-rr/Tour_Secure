import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, MapPin, Activity, Shield, Compass, Bot, Timer } from "lucide-react";
import { useSos } from "@/context/SosContext";
import { getNearby, getSafety, localHour, type PlaceCard, type SafetyInfo } from "@/services/recommendations";
import { catUi, fmtDistance, DEFAULT_CATEGORIES } from "@/lib/categories";
import SafetyBadge from "@/components/explore/SafetyBadge";
import { useHealth } from "@/hooks/useHealth";
import { checkPoint, listZones } from "@services/geofencing/geo";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

type Coords = { lat: number; lng: number };
type RiskLevel = "low" | "medium" | "high";
type RiskResp = {
  inside: boolean;
  riskLevel?: RiskLevel;
  riskScore?: number;
  matchedZones?: { name: string }[];
};

type Zone = {
  _id: string;
  name: string;
  riskLevel: RiskLevel;
  riskScore: number;
  polygon: { type: "Polygon"; coordinates: [number, number][][] }; // [ [ [lng,lat], ... ] ]
};

export default function Home() {
  const status = useHealth();
  const { notify } = useToast();

  // location state
  const [coords, setCoords] = useState<Coords>({ lat: 13.0827, lng: 80.2707 });
  const [manual, setManual] = useState<Coords>({ lat: 13.0827, lng: 80.2707 });

  // risk + zones
  const [risk, setRisk] = useState<RiskResp | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [busy, setBusy] = useState(false);

  // SOS (shared flow: countdown, alert, live tracking & sharing)
  const sos = useSos();
  const arming = sos.arming;
  const seconds = sos.seconds;

  // recommendations near the current point
  const [recs, setRecs] = useState<PlaceCard[] | null>(null);

  // get browser location on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      const next = { lat: p.coords.latitude, lng: p.coords.longitude };
      setCoords(next);
      setManual(next);
    });
  }, []);

  // load zones once
  useEffect(() => {
    (async () => {
      try {
        const data = await listZones();
        setZones(data);
      } catch {
        // non-fatal
      }
    })();
  }, []);

  // refresh risk when coords change
  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true);
      try {
        const res = await checkPoint(coords.lat, coords.lng);
        if (!alive) return;
        setRisk(res as RiskResp);
      } catch {
        if (!alive) return;
        setRisk(null);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [coords]);

  // derived display
  // Safety score (0-100, higher = safer) combining zones, area reviews and time of day.
  // Previously this card showed the zone's *risk* score, which read backwards.
  const [safety, setSafety] = useState<SafetyInfo | null>(null);
  useEffect(() => {
    let alive = true;
    getSafety(coords, localHour()).then((s) => alive && setSafety(s));
    return () => {
      alive = false;
    };
  }, [coords]);
  const score = safety ? safety.score : risk ? 100 - (risk.riskScore ?? 0) : 0;
  const level = (safety
    ? safety.level === "safe" ? "low" : safety.level === "unsafe" ? "high" : "medium"
    : risk?.riskLevel ?? "low") as RiskLevel; // drives colours (low risk = green)
  const levelText = safety ? safety.level : level;
  const zoneName = risk?.matchedZones?.[0]?.name ?? (risk?.inside ? "Unnamed Zone" : "—");

  const levelColor = useMemo(
    () =>
      level === "high"
        ? "text-red-600"
        : level === "medium"
        ? "text-yellow-600"
        : "text-emerald-600",
    [level]
  );

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        setCoords(next);
        setManual(next);
      },
      (err) => notify({ tone: "error", message: err.message })
    );
  }

  function armSOS() {
    sos.arm();
  }

  function cancelSOS() {
    sos.cancelArm();
  }

  useEffect(() => {
    let alive = true;
    getNearby({ origin: coords, categories: DEFAULT_CATEGORIES, radiusKm: 15, limit: 4, hour: localHour(), avoidUnsafe: true })
      .then((r) => alive && setRecs(r.items))
      .catch(() => alive && setRecs([]));
    return () => {
      alive = false;
    };
  }, [coords]);

  // nearest zones (top 3 by distance to ring centroid; simple, fast)
  const nearest = useMemo(() => {
    if (!zones?.length) return [];
    const withDist = zones
      .map((z) => {
        const ring = z.polygon?.coordinates?.[0] || [];
        const { lat: czLat, lng: czLng } = centroidFromRing(ring);
        const d = haversine(coords.lat, coords.lng, czLat, czLng);
        return { ...z, _distKm: d };
      })
      .sort((a, b) => a._distKm - b._distKm)
      .slice(0, 3);
    return withDist;
  }, [zones, coords]);

  return (
    <>
      {/* TOP: Welcome + Your Safety Score */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader title="Welcome to Tour Secure" />
          <CardBody>
            <div className="flex flex-col gap-3 text-sm text-neutral-600">
              <div className="flex items-center gap-2">
                <Activity size={16} />
                Backend: {status}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <MapPin size={16} />
                <span>
                  Lat: {coords.lat.toFixed(5)}, Lng: {coords.lng.toFixed(5)}
                </span>
                <Button variant="outline" className="ml-2" onClick={useMyLocation}>
                  Use my location
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="Latitude"
                  className="w-40"
                  value={manual.lat}
                  onChange={(e) =>
                    setManual((s) => ({ ...s, lat: parseFloat(e.target.value || "0") }))
                  }
                />
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="Longitude"
                  className="w-40"
                  value={manual.lng}
                  onChange={(e) =>
                    setManual((s) => ({ ...s, lng: parseFloat(e.target.value || "0") }))
                  }
                />
                <Button onClick={() => setCoords(manual)}>Update point</Button>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your Safety Score" actions={<Shield size={18} className="text-neutral-400" />} />
          <CardBody>
            <div className="flex items-end gap-4">
              <div className="text-5xl font-extrabold leading-none">{busy ? "…" : score}</div>
              <div className={`text-sm font-semibold ${levelColor}`}>{busy ? "" : levelText.toUpperCase()}</div>
            </div>
            <div className="mt-1 text-xs text-neutral-500">Zone: {zoneName}</div>

            <div className="mt-4 h-2 w-full rounded-full bg-neutral-200 overflow-hidden">
              <div
                className={`h-full ${
                  level === "high" ? "bg-red-500" : level === "medium" ? "bg-yellow-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* MID: Center SOS + right info */}
      <div className="grid gap-6 md:grid-cols-3 items-start">
        <div className="hidden md:block" />

        {/* Circular SOS with 5s cancel */}
        <div className="flex justify-center">
          <button
            onClick={armSOS}
            className="
              relative select-none
              h-56 w-56 rounded-full
              bg-gradient-to-b from-red-500 to-red-600
              text-white text-3xl font-bold tracking-wide
              shadow-[0_10px_30px_rgba(220,38,38,.5)]
              active:scale-95 transition
              ring-4 ring-red-200
              before:absolute before:inset-0 before:rounded-full before:animate-ping before:bg-red-400/30
            "
            aria-label="SOS panic button"
          >
            <span className="relative z-10 inline-flex items-center gap-2">
              <AlertTriangle size={28} /> SOS
            </span>

            {/* countdown overlay */}
            {arming && (
              <span className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center z-20">
                <span className="text-5xl font-bold">{seconds}</span>
              </span>
            )}
          </button>
        </div>

        <Card>
          <CardHeader title="Safety at This Place" />
          <CardBody>
            <div className="text-sm text-neutral-600">
              {busy ? "Calculating…" : risk?.inside ? "This point is inside a defined zone." : "This point is outside defined zones."}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <Metric label="Score" value={busy ? "…" : String(score)} />
              <Metric label="Level" value={busy ? "…" : levelText} tone={level} />
              <Metric label="Zone" value={busy ? "…" : zoneName} />
            </div>

            {/* cancel bar shows only while arming */}
            {arming && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={cancelSOS} aria-label="Cancel SOS">
                  Cancel within {seconds}s
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* BOTTOM: Nearby zones + Travel advisory + Shortcuts */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader title="Nearby Zone Risk (Top 3)" />
          <CardBody>
            {!nearest.length ? (
              <div className="text-sm text-neutral-600">No zones found.</div>
            ) : (
              <ul className="divide-y">
                {nearest.map((z) => (
                  <li key={z._id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{z.name}</div>
                      <div className="text-xs text-neutral-500">{z._distKm.toFixed(2)} km away</div>
                    </div>
                    <div className="text-sm text-right">
                      <div className={z.riskLevel === "high" ? "text-red-600" : z.riskLevel === "medium" ? "text-yellow-600" : "text-emerald-600"}>
                        {z.riskLevel.toUpperCase()}
                      </div>
                      <div className="text-neutral-500">Risk: {z.riskScore}/100</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Travel Advisory" />
          <CardBody>
            <ul className="list-disc pl-5 text-sm space-y-2 text-neutral-700">
              <li>Keep a copy of ID and emergency contacts offline.</li>
              <li>Avoid poorly lit areas at night; prefer main roads.</li>
              <li>Use official taxi apps; share trip with a trusted contact.</li>
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader
            title="Recommended near you"
            actions={
              <Link to="/explore" className="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline">
                <Compass size={16} /> Explore all
              </Link>
            }
          />
          <CardBody>
            {!recs ? (
              <div className="text-sm text-neutral-600">Finding places…</div>
            ) : recs.length === 0 ? (
              <div className="text-sm text-neutral-600">
                No catalogued places near this point yet. <Link to="/explore" className="underline">Search a city</Link>.
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {recs.map((p) => {
                  const ui = catUi(p.matchedCategory) ?? catUi(p.category);
                  return (
                    <li key={p.id} className="flex items-start justify-between gap-2 rounded-xl border p-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium" style={{ color: ui?.color }}>
                          {ui?.emoji} {ui?.short}
                        </div>
                        <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
                          {p.name}
                        </a>
                        <div className="text-xs text-neutral-500">{fmtDistance(p.distanceKm)} away</div>
                      </div>
                      <SafetyBadge level={p.safety.level} score={p.safety.score} compact />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Travel smarter" />
          <CardBody className="space-y-3">
            <Link to="/assistant" className="flex items-center gap-3 rounded-xl border p-3 hover:bg-neutral-50">
              <Bot size={20} />
              <div>
                <div className="text-sm font-medium">Ask the AI assistant</div>
                <div className="text-xs text-neutral-500">Plans, places & safety answers</div>
              </div>
            </Link>
            <Link to="/explore?tab=plan" className="flex items-center gap-3 rounded-xl border p-3 hover:bg-neutral-50">
              <Compass size={20} />
              <div>
                <div className="text-sm font-medium">Plan a trip</div>
                <div className="text-xs text-neutral-500">Day-by-day, safety-aware</div>
              </div>
            </Link>
            <Link to="/safety" className="flex items-center gap-3 rounded-xl border p-3 hover:bg-neutral-50">
              <Timer size={20} />
              <div>
                <div className="text-sm font-medium">Safe check-in timer</div>
                <div className="text-xs text-neutral-500">Auto-alert if you don't check in</div>
              </div>
            </Link>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader title="Quick Incident" />
          <CardBody>
            <p className="text-sm text-neutral-600 mb-3">Log a brief incident snapshot. You can file a full e-FIR next.</p>
            <Button onClick={() => (window.location.href = "/efir")}>Open e-FIR</Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Nearest Police Station" />
          <CardBody>
            <p className="text-sm text-neutral-600 mb-3">Open Google Maps near your location.</p>
            <Button
              variant="outline"
              onClick={() =>
                window.open(
                  `https://www.google.com/maps/search/police+station/@${coords.lat},${coords.lng},14z`,
                  "_blank"
                )
              }
            >
              Open Maps
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Nearest Hospital" />
          <CardBody>
            <p className="text-sm text-neutral-600 mb-3">Find emergency medical help quickly.</p>
            <Button
              variant="outline"
              onClick={() =>
                window.open(
                  `https://www.google.com/maps/search/hospital/@${coords.lat},${coords.lng},14z`,
                  "_blank"
                )
              }
            >
              Open Maps
            </Button>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

/* ---------- helpers ---------- */

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: RiskLevel;
}) {
  const c =
    tone === "high"
      ? "text-red-600"
      : tone === "medium"
      ? "text-yellow-600"
      : tone === "low"
      ? "text-emerald-600"
      : "text-neutral-900";
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-lg font-semibold ${c}`}>{value}</div>
    </div>
  );
}

// centroid of a polygon ring [ [lng,lat], ... ]
function centroidFromRing(ring: [number, number][]) {
  if (!ring?.length) return { lat: 0, lng: 0 };
  let sx = 0,
    sy = 0,
    n = 0;
  for (const [lng, lat] of ring) {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      sx += lng;
      sy += lat;
      n++;
    }
  }
  return { lat: sy / Math.max(1, n), lng: sx / Math.max(1, n) };
}

// km distance between two lat/lng points
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
