// frontend/src/context/SosContext.tsx
// One SOS flow for the whole app (Home button, AI assistant, Safety Center):
//   arm() -> 5 s cancellable countdown -> alert sent with GPS -> share dialog
//   with live-tracking link, WhatsApp/SMS to emergency contacts, "I'm safe".
// While an alert is open the device keeps streaming its location.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Copy, MessageCircle, Phone, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { cancelSos, sendSos, smsLink, updateSosLocation, waLink, type SosResult } from "@/services/safetyCenter";

type SosCtx = {
  arming: boolean;
  seconds: number;
  active: SosResult | null;
  arm: () => void;
  cancelArm: () => void;
  sendNow: () => void;
};

const Ctx = createContext<SosCtx | null>(null);
const COUNTDOWN = 5;

function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 });
  });
}

export function SosProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [arming, setArming] = useState(false);
  const [seconds, setSeconds] = useState(COUNTDOWN);
  const [active, setActive] = useState<SosResult | null>(null);
  const [guestPrompt, setGuestPrompt] = useState(false);
  const [sending, setSending] = useState(false);
  const timer = useRef<number | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);

  const clear = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };

  const sendNow = useCallback(async () => {
    clear();
    setArming(false);
    if (!user) {
      setGuestPrompt(true);
      return;
    }
    setSending(true);
    try {
      const pos = await currentPosition();
      const res = await sendSos(
        pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy } : {}
      );
      setActive(res);
      if (!pos) notify({ tone: "warning", title: "SOS sent without GPS", message: "Location unavailable — call 112 and describe where you are." });
    } catch (e: any) {
      notify({ tone: "error", title: "SOS failed", message: "Could not reach the server. CALL 112 NOW." });
    } finally {
      setSending(false);
    }
  }, [user, notify]);

  const arm = useCallback(() => {
    if (arming || sending) return;
    setSeconds(COUNTDOWN);
    setArming(true);
    // the updater only counts down; the effect below fires the alert at 0
    // (side effects inside state updaters run twice under StrictMode)
    timer.current = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
  }, [arming, sending]);

  useEffect(() => {
    if (arming && seconds === 0) sendNow();
  }, [arming, seconds, sendNow]);

  const cancelArm = useCallback(() => {
    clear();
    setArming(false);
    notify({ tone: "info", title: "SOS cancelled", message: "No alert was sent." });
  }, [notify]);

  // stream location while an alert is open (throttled to every 15 s)
  useEffect(() => {
    if (!active || !("geolocation" in navigator)) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        if (now - lastSent.current < 15000) return;
        lastSent.current = now;
        updateSosLocation(active.id, p.coords.latitude, p.coords.longitude, p.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [active]);

  useEffect(() => () => clear(), []);

  async function close(reason: "safe" | "false_alarm") {
    if (!active) return;
    try {
      await cancelSos(active.id, reason);
      notify({ tone: "success", message: reason === "safe" ? "Glad you're safe. Alert closed." : "Alert cancelled." });
    } catch {
      notify({ tone: "error", message: "Couldn't update the alert." });
    }
    setActive(null);
  }

  const value = useMemo(() => ({ arming, seconds, active, arm, cancelArm, sendNow }), [arming, seconds, active, arm, cancelArm, sendNow]);

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* countdown overlay */}
      {arming && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-label="SOS countdown">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <AlertTriangle className="mx-auto text-red-600" size={36} />
            <div className="mt-2 text-lg font-semibold">Sending SOS in</div>
            <div className="my-2 text-6xl font-extrabold text-red-600 tabular-nums">{seconds}</div>
            <p className="text-sm text-neutral-600">Your location will be shared with Tour Secure and your emergency contacts.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="rounded-lg border border-neutral-300 px-4 py-2 font-medium" onClick={cancelArm}>
                Cancel
              </button>
              <button className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white" onClick={sendNow}>
                Send now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* guests can't raise alerts: make calling 112 the obvious action */}
      {guestPrompt && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="text-lg font-semibold">Call emergency services</div>
            <p className="mt-1 text-sm text-neutral-600">SOS alerts with live tracking need an account. If you're in danger, call now.</p>
            <a href="tel:112" className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-lg font-bold text-white">
              <Phone /> Call 112
            </a>
            <div className="mt-3 flex justify-between text-sm">
              <Link to="/login" className="underline" onClick={() => setGuestPrompt(false)}>
                Sign in for SOS
              </Link>
              <button className="text-neutral-500" onClick={() => setGuestPrompt(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {active && <ShareDialog sos={active} onSafe={() => close("safe")} onFalseAlarm={() => close("false_alarm")} onHide={() => setActive(null)} />}
    </Ctx.Provider>
  );
}

function ShareDialog({ sos, onSafe, onFalseAlarm, onHide }: { sos: SosResult; onSafe: () => void; onFalseAlarm: () => void; onHide: () => void }) {
  const { notify } = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(sos.shareText);
      notify({ tone: "success", message: "Message with tracking link copied." });
    } catch {
      notify({ tone: "warning", message: sos.trackUrl });
    }
  }
  async function nativeShare() {
    try {
      await (navigator as any).share?.({ title: "SOS — Tour Secure", text: sos.shareText, url: sos.trackUrl });
    } catch {
      /* user dismissed */
    }
  }
  return (
    <div className="fixed inset-0 z-[190] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="SOS sent">
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <button className="absolute right-3 top-3 rounded p-1 text-neutral-400 hover:bg-neutral-100" onClick={onHide} aria-label="Hide (alert stays open)">
          <X size={18} />
        </button>
        <div className="rounded-t-2xl bg-red-600 px-6 py-4 text-white">
          <div className="text-lg font-bold">🚨 SOS alert is live</div>
          <div className="text-sm opacity-90">Your location is being shared and updated.</div>
        </div>
        <div className="space-y-4 p-6">
          <a href="tel:112" className="flex items-center justify-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 font-semibold text-red-700 ring-1 ring-red-200">
            <Phone size={18} /> Call 112 (police · ambulance · fire)
          </a>

          <div>
            <div className="mb-1 text-xs font-medium text-neutral-500">Live tracking link</div>
            <div className="flex gap-2">
              <input readOnly value={sos.trackUrl} className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-xs" onFocus={(e) => e.target.select()} />
              <button className="rounded-lg border border-neutral-300 px-3" onClick={copy} aria-label="Copy message">
                <Copy size={16} />
              </button>
              {"share" in navigator && (
                <button className="rounded-lg border border-neutral-300 px-3 text-sm" onClick={nativeShare}>
                  Share
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-neutral-500">Notify your emergency contacts</div>
            {sos.contacts.length === 0 ? (
              <p className="text-sm text-neutral-600">
                No contacts saved yet.{" "}
                <Link to="/safety" className="underline" onClick={onHide}>
                  Add contacts
                </Link>{" "}
                so you can alert them in one tap next time.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {sos.contacts.map((c) => (
                  <li key={c.phone} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-neutral-500">{c.relation || c.phone}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <a className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white" href={waLink(c.phone, sos.shareText)} target="_blank" rel="noreferrer">
                        <MessageCircle size={12} className="mr-1 inline" />
                        WhatsApp
                      </a>
                      <a className="rounded-md border px-2 py-1 text-xs font-medium" href={smsLink(c.phone, sos.shareText)}>
                        SMS
                      </a>
                      <a className="rounded-md border px-2 py-1 text-xs font-medium" href={`tel:${c.phone}`}>
                        Call
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white" onClick={onSafe}>
              <ShieldCheck size={18} /> I'm safe now
            </button>
            <button className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium" onClick={onFalseAlarm}>
              False alarm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useSos(): SosCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSos must be used within SosProvider");
  return c;
}
