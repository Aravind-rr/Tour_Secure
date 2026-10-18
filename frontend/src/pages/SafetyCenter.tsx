// frontend/src/pages/SafetyCenter.tsx
// Emergency contacts · Safe check-in timer · My alerts · Travel preferences · Helplines
import { useCallback, useEffect, useState } from "react";
import { Copy, Phone, Plus, ShieldCheck, Siren, Timer, Trash2, Users, Heart } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import Loading from "@/components/ui/Loading";
import { useToast } from "@/components/ui/Toast";
import { useSos } from "@/context/SosContext";
import CategoryChips from "@/components/explore/CategoryChips";
import type { CategoryId } from "@/lib/categories";
import {
  EMERGENCY_NUMBERS,
  cancelCheckIn,
  cancelSos,
  completeCheckIn,
  extendCheckIn,
  getActiveCheckIn,
  getMyAlerts,
  getProfile,
  pingCheckIn,
  saveContacts,
  savePreferences,
  startCheckIn,
  type CheckIn,
  type EmergencyContact,
  type MyAlert,
} from "@/services/safetyCenter";

const errMsg = (e: any, d: string) => e?.response?.data?.error || e?.message || d;

export default function SafetyCenter() {
  const sos = useSos();
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ShieldCheck className="text-emerald-600" /> Safety Center
          </h1>
          <p className="mt-1 text-sm text-neutral-600">Set up who to alert, run a safe check-in timer for risky stretches, and review your alerts.</p>
        </div>
        <button onClick={sos.arm} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 font-semibold text-white shadow hover:bg-red-700">
          <Siren size={18} /> SOS
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CheckInCard />
        <ContactsCard />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AlertsCard />
        </div>
        <HelplinesCard />
      </div>
      <PreferencesCard />
    </>
  );
}

/* ------------------------------------------------------------------ */

function CheckInCard() {
  const { notify } = useToast();
  const [ci, setCi] = useState<CheckIn | null>(null);
  const [recent, setRecent] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [skew, setSkew] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await getActiveCheckIn();
      setCi(r.checkIn);
      setRecent(r.recent);
      setSkew(new Date(r.serverTime).getTime() - Date.now());
    } catch (e) {
      notify({ tone: "error", message: errMsg(e, "Failed to load check-in") });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  // tick + periodically refresh status (escalation happens server-side)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    const r = window.setInterval(load, 30000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(r);
    };
  }, [load]);

  // keep last-known location fresh while a timer runs (every 2 min)
  useEffect(() => {
    if (!ci || !("geolocation" in navigator)) return;
    const send = () => navigator.geolocation.getCurrentPosition((p) => pingCheckIn(ci.id, p.coords.latitude, p.coords.longitude), () => {}, { maximumAge: 60000 });
    send();
    const t = window.setInterval(send, 120000);
    return () => window.clearInterval(t);
  }, [ci?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start(minutes: number) {
    setBusy(true);
    try {
      const pos = await new Promise<GeolocationPosition | null>((res) =>
        "geolocation" in navigator ? navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 5000, maximumAge: 60000 }) : res(null)
      );
      const c = await startCheckIn({ minutes, label: label.trim() || undefined, ...(pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude } : {}) });
      setCi(c);
      setLabel("");
      notify({ tone: "success", title: "Check-in started", message: `We'll alert your contacts if you don't check in within ${minutes} min.` });
    } catch (e) {
      notify({ tone: "error", message: errMsg(e, "Could not start") });
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<any>, ok: string) {
    setBusy(true);
    try {
      await fn();
      notify({ tone: "success", message: ok });
      await load();
    } catch (e) {
      notify({ tone: "error", message: errMsg(e, "Action failed") });
    } finally {
      setBusy(false);
    }
  }

  const remainingMs = ci ? new Date(ci.dueAt).getTime() - (now + skew) : 0;
  const overdue = remainingMs <= 0;
  const mm = Math.floor(Math.abs(remainingMs) / 60000);
  const ss = Math.floor((Math.abs(remainingMs) % 60000) / 1000);
  const lastEscalated = recent.find((r) => r.status === "escalated");

  return (
    <Card>
      <CardHeader title="Safe check-in timer" actions={<Timer size={18} className="text-neutral-400" />} />
      <CardBody className="space-y-4">
        {loading ? (
          <Loading />
        ) : ci ? (
          <div className={`rounded-xl p-4 text-center ${overdue ? "bg-red-50" : "bg-emerald-50"}`}>
            <div className="text-xs font-medium text-neutral-600">{ci.label}</div>
            <div className={`my-1 text-5xl font-extrabold tabular-nums ${overdue ? "text-red-600" : "text-emerald-700"}`}>
              {overdue ? "-" : ""}
              {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
            </div>
            <div className="text-xs text-neutral-600">
              {overdue ? "Overdue — an alert will be raised any moment" : `Check in by ${new Date(ci.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => act(() => completeCheckIn(ci.id), "Checked in — stay safe!")}
                disabled={busy}
                className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <ShieldCheck size={16} className="mr-1" /> I'm safe
              </button>
              <Button variant="outline" onClick={() => act(() => extendCheckIn(ci.id, 15), "Extended by 15 min")} disabled={busy}>
                +15 min
              </Button>
              <Button variant="outline" onClick={() => act(() => extendCheckIn(ci.id, 30), "Extended by 30 min")} disabled={busy}>
                +30 min
              </Button>
              <Button variant="ghost" onClick={() => act(() => cancelCheckIn(ci.id), "Timer cancelled")} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-600">
              Going on a night ride, trek or meeting someone new? Start a timer. If you don't tap <b>I'm safe</b> in time, Tour Secure raises an alert with your last location.
            </p>
            <Input placeholder="What are you doing? (e.g. Taxi to hotel)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
            <div className="grid grid-cols-4 gap-2">
              {[15, 30, 60, 120].map((m) => (
                <Button key={m} variant="outline" disabled={busy} onClick={() => start(m)}>
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </Button>
              ))}
            </div>
          </>
        )}
        {lastEscalated && !ci && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Missed check-in "{lastEscalated.label}" raised an alert.{" "}
            <button className="font-medium underline" onClick={() => act(() => completeCheckIn(lastEscalated.id), "Marked safe — alert resolved")}>
              I'm safe — resolve it
            </button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function ContactsCard() {
  const { notify } = useToast();
  const [rows, setRows] = useState<EmergencyContact[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getProfile()
      .then((p) => setRows(p.emergencyContacts))
      .catch((e) => {
        setRows([]);
        notify({ tone: "error", message: errMsg(e, "Failed to load contacts") });
      });
  }, [notify]);

  const update = (i: number, patch: Partial<EmergencyContact>) => {
    setRows((r) => (r ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };

  async function save() {
    if (!rows) return;
    setSaving(true);
    try {
      const p = await saveContacts(rows.filter((r) => r.name.trim() || r.phone.trim()));
      setRows(p.emergencyContacts);
      setDirty(false);
      notify({ tone: "success", message: "Emergency contacts saved." });
    } catch (e) {
      notify({ tone: "error", message: errMsg(e, "Could not save") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Emergency contacts" actions={<Users size={18} className="text-neutral-400" />} />
      <CardBody className="space-y-3">
        {!rows ? (
          <Loading />
        ) : (
          <>
            {rows.length === 0 && <p className="text-sm text-neutral-600">Add up to 5 people. When you send SOS you can alert them in one tap with a live-tracking link.</p>}
            {rows.map((c, i) => (
              <div key={c.id ?? i} className="grid grid-cols-12 gap-2">
                <Input className="col-span-4" placeholder="Name" value={c.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Contact name" />
                <Input className="col-span-4" placeholder="+91 98765 43210" value={c.phone} onChange={(e) => update(i, { phone: e.target.value })} aria-label="Phone" inputMode="tel" />
                <Input className="col-span-3" placeholder="Relation" value={c.relation ?? ""} onChange={(e) => update(i, { relation: e.target.value })} aria-label="Relation" />
                <button
                  className="col-span-1 grid place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100"
                  onClick={() => {
                    setRows((r) => (r ?? []).filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                  aria-label={`Remove ${c.name || "contact"}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                disabled={rows.length >= 5}
                onClick={() => {
                  setRows((r) => [...(r ?? []), { name: "", phone: "", relation: "" }]);
                  setDirty(true);
                }}
              >
                <Plus size={16} className="mr-1" /> Add contact
              </Button>
              <Button onClick={save} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function AlertsCard() {
  const { notify } = useToast();
  const [items, setItems] = useState<MyAlert[] | null>(null);
  const load = useCallback(() => getMyAlerts().then(setItems).catch(() => setItems([])), []);
  useEffect(() => {
    load();
  }, [load]);

  const tone = (s: MyAlert["status"]) => (s === "open" ? "danger" : s === "acknowledged" ? "warning" : s === "resolved" ? "success" : "neutral");

  async function close(a: MyAlert) {
    try {
      await cancelSos(a.id, "safe");
      notify({ tone: "success", message: "Alert closed." });
      load();
    } catch (e) {
      notify({ tone: "error", message: errMsg(e, "Could not close alert") });
    }
  }

  return (
    <Card>
      <CardHeader title="My alerts" actions={<Button variant="ghost" onClick={load}>Refresh</Button>} />
      <CardBody>
        {!items ? (
          <Loading />
        ) : items.length === 0 ? (
          <p className="text-sm text-neutral-600">No alerts yet. Hopefully it stays that way. 💚</p>
        ) : (
          <ul className="divide-y">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {a.type === "checkin_missed" ? "⏱️ Missed check-in" : "🚨 SOS"} <Badge tone={tone(a.status) as any}>{a.status}</Badge>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(a.createdAt).toLocaleString()}
                    {a.lat != null && a.lon != null && (
                      <>
                        {" · "}
                        <a className="underline" href={`https://www.google.com/maps?q=${a.lat},${a.lon}`} target="_blank" rel="noreferrer">
                          {a.lat.toFixed(4)}, {a.lon.toFixed(4)}
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.trackUrl && a.shareActive && (
                    <Button
                      variant="outline"
                      onClick={() => navigator.clipboard?.writeText(a.trackUrl!).then(() => notify({ tone: "success", message: "Tracking link copied" }), () => {})}
                    >
                      <Copy size={14} className="mr-1" /> Link
                    </Button>
                  )}
                  {(a.status === "open" || a.status === "acknowledged") && <Button onClick={() => close(a)}>I'm safe</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function HelplinesCard() {
  return (
    <Card>
      <CardHeader title="Helplines (India)" actions={<Phone size={18} className="text-neutral-400" />} />
      <CardBody>
        <ul className="space-y-2">
          {EMERGENCY_NUMBERS.map((n) => (
            <li key={n.number}>
              <a href={`tel:${n.number}`} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-neutral-50">
                <span className="text-sm">
                  <span aria-hidden className="mr-2">{n.emoji}</span>
                  {n.label}
                </span>
                <span className="font-semibold tabular-nums">{n.number}</span>
              </a>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function PreferencesCard() {
  const { notify } = useToast();
  const [interests, setInterests] = useState<CategoryId[] | null>(null);
  const [avoidUnsafe, setAvoidUnsafe] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setInterests(p.interests);
        setAvoidUnsafe(p.avoidUnsafe);
      })
      .catch(() => setInterests([]));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await savePreferences({ interests: interests ?? [], avoidUnsafe });
      notify({ tone: "success", message: "Preferences saved — Explore will use them by default." });
    } catch (e) {
      notify({ tone: "error", message: errMsg(e, "Could not save") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Travel preferences" actions={<Heart size={18} className="text-neutral-400" />} />
      <CardBody className="space-y-3">
        {!interests ? (
          <Loading />
        ) : (
          <>
            <p className="text-sm text-neutral-600">What do you enjoy? Recommendations and generated plans will favour these.</p>
            <CategoryChips value={interests} onChange={setInterests} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={avoidUnsafe} onChange={(e) => setAvoidUnsafe(e.target.checked)} className="rounded" />
              Hide places in low-safety areas by default
            </label>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save preferences"}
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
