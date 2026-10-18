// frontend/src/hooks/useGeolocation.ts
// Shared "where is the user" state with a remembered last position.
import { useCallback, useEffect, useState } from "react";

export type Coords = { lat: number; lng: number };
export type GeoStatus = "idle" | "locating" | "ok" | "manual" | "denied" | "unavailable";

const KEY = "ts_last_location_v1";

function readLast(): { coords: Coords; label: string } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Number.isFinite(v?.coords?.lat) && Number.isFinite(v?.coords?.lng) ? v : null;
  } catch {
    return null;
  }
}

function writeLast(coords: Coords, label: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ coords, label }));
  } catch {
    /* storage may be unavailable */
  }
}

export function getLastKnownLocation() {
  return readLast();
}

export function useGeolocation(opts: { auto?: boolean } = {}) {
  const last = readLast();
  const [coords, setCoords] = useState<Coords | null>(last?.coords ?? null);
  const [label, setLabel] = useState<string>(last?.label ?? "");
  const [status, setStatus] = useState<GeoStatus>(last ? "ok" : "idle");
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("Geolocation is not supported by this browser.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude };
        setCoords(c);
        setLabel("Your location");
        setStatus("ok");
        setError(null);
        writeLast(c, "Your location");
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        setError(err.message || "Could not get your location");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const setManual = useCallback((c: Coords, l: string) => {
    setCoords(c);
    setLabel(l);
    setStatus("manual");
    setError(null);
    writeLast(c, l);
  }, []);

  useEffect(() => {
    if (opts.auto) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { coords, label, status, error, locate, setManual };
}
