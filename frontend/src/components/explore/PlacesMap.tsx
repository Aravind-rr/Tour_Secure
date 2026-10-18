import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { catUi, fmtDistance } from "@/lib/categories";
import type { LatLng, PlaceCard } from "@/services/recommendations";

type Props = {
  origin?: LatLng | null;
  places: PlaceCard[];
  selectedId?: string | null;
  onSelect?: (p: PlaceCard) => void;
  route?: LatLng[];
  height?: number | string;
};

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function FlyTo({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [target, map]);
  return null;
}

export default function PlacesMap({ origin, places, selectedId, onSelect, route, height = 420 }: Props) {
  const center: [number, number] = origin ? [origin.lat, origin.lng] : places[0] ? [places[0].lat, places[0].lng] : [20.59, 78.96];
  const pts: LatLng[] = [...(origin ? [origin] : []), ...places.map((p) => ({ lat: p.lat, lng: p.lng }))];
  const selected = places.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="overflow-hidden rounded-xl border" style={{ height }}>
      <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={pts} />
        <FlyTo target={selected ? { lat: selected.lat, lng: selected.lng } : null} />
        {route && route.length > 1 && <Polyline positions={route.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#111827", weight: 3, dashArray: "6 6", opacity: 0.7 }} />}
        {origin && (
          <CircleMarker center={[origin.lat, origin.lng]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }}>
            <Popup>You are here</Popup>
          </CircleMarker>
        )}
        {places.map((p, i) => {
          const ui = catUi(p.matchedCategory) ?? catUi(p.category);
          const on = p.id === selectedId;
          return (
            <CircleMarker
              key={`${p.id}-${i}`}
              center={[p.lat, p.lng]}
              radius={on ? 11 : 8}
              eventHandlers={{ click: () => onSelect?.(p) }}
              pathOptions={{ color: on ? "#111827" : "#fff", weight: 2, fillColor: ui?.color ?? "#666", fillOpacity: 0.95 }}
            >
              <Popup>
                <div style={{ minWidth: 170 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {ui?.emoji} {ui?.short} · {fmtDistance(p.distanceKm)}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Safety: <b>{p.safety.level}</b> ({p.safety.score}/100)
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
