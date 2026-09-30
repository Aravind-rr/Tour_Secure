import {
  MapContainer,
  TileLayer,
  useMap,
  CircleMarker,
  Popup,
} from "react-leaflet";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { API_BASE } from "@/lib/api";

type ScorePoint = { name?: string; lat: number; lng: number; safety_score: number };

/* ---------------- Heat layer ---------------- */
function HeatLayer({ points }: { points: ScorePoint[] }) {
  const map = useMap();
  const layerRef = useRef<L.HeatLayer | null>(null);

  const tuples = useMemo<L.HeatLatLngTuple[]>(
    () => points.map((p) => [p.lat, p.lng, (100 - p.safety_score) / 100]), // lower safety = hotter
    [points]
  );

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }
    layerRef.current = L.heatLayer(tuples, {
      radius: 28,
      blur: 18,
      maxZoom: 16,
    }).addTo(map);

    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
    };
  }, [map, tuples]);

  return null;
}

/* ---------------- Debug overlay ---------------- */
function debugColor(score: number) {
  if (score >= 80) return "#1a9850"; // green
  if (score >= 60) return "#66bd63";
  if (score >= 40) return "#fee08b";
  if (score >= 20) return "#f46d43";
  return "#d73027"; // red
}

function DebugOverlay({ points, show }: { points: ScorePoint[]; show: boolean }) {
  if (!show) return null;
  return (
    <>
      {points.map((p, idx) => (
        <CircleMarker
          key={`${p.lat}-${p.lng}-${idx}`}
          center={[p.lat, p.lng]}
          radius={6}
          pathOptions={{
            color: "#333",
            fillColor: debugColor(p.safety_score),
            fillOpacity: 0.9,
            weight: 1,
          }}
        >
          <Popup>
            <div style={{ minWidth: 160 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {p.name || "Unknown area"}
              </div>
              <div>
                Safety Score: <b>{p.safety_score}</b>/100
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Lat: {p.lat.toFixed(5)} • Lng: {p.lng.toFixed(5)}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

/* ---------------- Main component ---------------- */
export default function SafetyHeatmap() {
  const [center, setCenter] = useState<[number, number]>([26.2, 92.94]); // default: Guwahati
  const [points, setPoints] = useState<ScorePoint[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ScorePoint | null>(null);

  const [useNearby, setUseNearby] = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const [showDebug, setShowDebug] = useState(false);

  // loader (cache-bust with ?v=timestamp)
  const loadData = useCallback(
    async (cacheBuster?: number) => {
      try {
        const v = cacheBuster ?? 0;
        const headers: HeadersInit = { "Cache-Control": "no-store" };

        if (useNearby && coordsRef.current) {
          const { lat, lng } = coordsRef.current;
          const r = await fetch(
            `${API_BASE}/safety-scores/nearby?lat=${lat}&lng=${lng}&radius=50&v=${v}`,
            { headers }
          );
          const data = await r.json();
          setPoints(Array.isArray(data) ? data : []);
        } else {
          const r = await fetch(`${API_BASE}/safety-scores?v=${v}`, { headers });
          const data = await r.json();
          setPoints(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore errors
      }
    },
    [useNearby]
  );

  // Initial load: try GPS, fallback to all
  useEffect(() => {
    const loadAll = () => loadData(Date.now());

    if (!navigator.geolocation) {
      loadAll();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude,
          lng = pos.coords.longitude;
        setCenter([lat, lng]);
        coordsRef.current = { lat, lng };
        setUseNearby(true);
        loadData(Date.now());
      },
      () => loadAll(),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [loadData]);

  // 🔁 Listen: refresh heatmap when reviews are submitted
  useEffect(() => {
    const handler = () => loadData(Date.now());
    window.addEventListener("heatmap:refresh", handler);
    return () => window.removeEventListener("heatmap:refresh", handler);
  }, [loadData]);

  // 🔁 Also refresh when tab regains focus
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadData(Date.now());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadData]);

  // search handler
  const onSearch = () => {
    if (!query.trim()) return;
    fetch(`${API_BASE}/safety-scores/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.message || !Array.isArray(data) || data.length === 0) {
          setResult({ name: "Not Found", lat: 0, lng: 0, safety_score: 0 });
          return;
        }
        const best: ScorePoint = data[0];
        setResult(best);
        setCenter([best.lat, best.lng]);
        setPoints((prev) =>
          prev.some(
            (p) =>
              Math.abs(p.lat - best.lat) < 1e-6 &&
              Math.abs(p.lng - best.lng) < 1e-6
          )
            ? prev
            : [...prev, best]
        );
      })
      .catch(() => {});
  };

  return (
    <div className="relative h-[100dvh] w-full">
      {/* Search bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white shadow rounded-xl overflow-hidden flex">
        <input
          className="px-3 py-2 text-sm outline-none min-w-[260px]"
          placeholder="Search area (e.g., Shillong)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        <button
          onClick={onSearch}
          className="px-4 py-2 text-white bg-blue-600"
        >
          Search
        </button>
      </div>

      {/* Result card */}
      {result && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 px-4 py-3 rounded-xl shadow text-center">
          <div className="font-semibold">{result.name}</div>
          <div className="text-sm">
            {result.name === "Not Found"
              ? "No data available"
              : `Safety Score: ${result.safety_score}/100`}
          </div>
        </div>
      )}

      <MapContainer center={center} zoom={8} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <HeatLayer points={points} />
        <DebugOverlay points={points} show={showDebug} />
      </MapContainer>

      {/* Legend + controls */}
      <div className="absolute right-4 bottom-4 z-[1000] bg-white/90 rounded-xl p-3 shadow text-sm space-y-2">
        <div className="font-semibold">Risk Heat Legend</div>
        <div>Red = Higher Risk (lower safety)</div>
        <div>Blue/Green = Lower Risk</div>

        <div className="h-px bg-neutral-200 my-1" />

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => setShowDebug(e.target.checked)}
          />
          <span>Debug: Points & Scores</span>
        </label>

        <button
          onClick={() => loadData(Date.now())}
          className="mt-1 w-full rounded-md bg-neutral-900 text-white px-3 py-1"
          title="Force refresh the heatmap"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
