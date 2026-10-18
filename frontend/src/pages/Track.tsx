// Public live-tracking page opened from an SOS / missed check-in share link.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from "react-leaflet";
import { Phone, RefreshCw } from "lucide-react";
import { getTrack } from "@/services/safetyCenter";
import { Card, CardBody } from "@/components/ui/Card";
import Loading from "@/components/ui/Loading";
import Badge from "@/components/ui/Badge";

type TrackData = Awaited<ReturnType<typeof getTrack>>;

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], Math.max(map.getZoom(), 15));
  }, [lat, lon, map]);
  return null;
}

export default function Track() {
  const { token = "" } = useParams();
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getTrack(token)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError(null);
          setUpdated(new Date());
        })
        .catch((e) => alive && setError(e?.response?.status === 410 ? "This tracking link has expired." : "Tracking link not found."));
    load();
    const t = window.setInterval(load, 10000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [token]);

  if (error)
    return (
      <Card>
        <CardBody>
          <div className="text-sm text-neutral-700">{error}</div>
        </CardBody>
      </Card>
    );
  if (!data) return <Loading label="Loading live location…" />;

  const open = data.status === "open" || data.status === "acknowledged";
  const title = data.type === "checkin_missed" ? `${data.name} missed a safety check-in` : `${data.name} sent an SOS`;

  return (
    <>
      <div className={`rounded-2xl p-5 text-white ${open ? "bg-red-600" : "bg-emerald-600"}`}>
        <div className="text-xl font-bold">{open ? "🚨 " : "✅ "}{title}</div>
        <div className="mt-1 text-sm opacity-90">
          {open ? "Live location below updates automatically." : data.status === "resolved" ? "They've marked themselves safe." : "The alert was cancelled."} Started {new Date(data.createdAt).toLocaleString()}.
        </div>
        {open && (
          <a href="tel:112" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-semibold text-red-700">
            <Phone size={18} /> Call 112
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
        <Badge tone={open ? "danger" : "success"}>{data.status}</Badge>
        {data.last ? <span>Last seen {new Date(data.last.at).toLocaleTimeString()}</span> : <span>No location shared</span>}
        {updated && (
          <span className="inline-flex items-center gap-1">
            <RefreshCw size={14} /> refreshed {updated.toLocaleTimeString()}
          </span>
        )}
        {data.last && (
          <a className="underline" href={`https://www.google.com/maps?q=${data.last.lat},${data.last.lon}`} target="_blank" rel="noreferrer">
            Open in Google Maps
          </a>
        )}
      </div>

      {data.last && (
        <div className="h-[60vh] overflow-hidden rounded-2xl border">
          <MapContainer center={[data.last.lat, data.last.lon]} zoom={15} style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Recenter lat={data.last.lat} lon={data.last.lon} />
            {data.trail.length > 1 && <Polyline positions={data.trail.map((p) => [p.lat, p.lon] as [number, number])} pathOptions={{ color: "#dc2626", weight: 3 }} />}
            <CircleMarker center={[data.last.lat, data.last.lon]} radius={10} pathOptions={{ color: "#fff", weight: 3, fillColor: "#dc2626", fillOpacity: 1 }}>
              <Popup>{data.name} · {new Date(data.last.at).toLocaleTimeString()}</Popup>
            </CircleMarker>
          </MapContainer>
        </div>
      )}
      {data.message && <p className="text-sm text-neutral-600">Note: {data.message}</p>}
    </>
  );
}
