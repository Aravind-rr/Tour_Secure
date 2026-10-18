import { useEffect, useState } from "react";
import { http } from "@/lib/http";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Loading from "@/components/ui/Loading";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Select from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";

type EFIR = { _id: string; name: string; contact?: string; summary?: string; description?: string; createdAt: string };
type Alert = {
  _id: string;
  userId?: string;
  type?: "sos" | "checkin_missed" | "anomaly";
  status?: "open" | "acknowledged" | "resolved" | "cancelled";
  lat?: number;
  lon?: number;
  message?: string;
  createdAt: string;
  updatedAt?: string;
  trackUrl?: string | null;
  trailCount?: number;
  user?: { id: string; name?: string; email?: string; contacts?: Array<{ name: string; phone: string; relation?: string }> } | null;
};
type CheckIn = { _id: string; label: string; dueAt: string; status: string; lat?: number; lon?: number; user?: { name?: string; email?: string } };

const statusTone = (s?: string) => (s === "open" ? "danger" : s === "acknowledged" ? "warning" : s === "resolved" ? "success" : "neutral");

export default function AdminDashboard() {
  const { notify } = useToast();
  const [efirs, setEfirs] = useState<EFIR[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [checkins, setCheckins] = useState<CheckIn[] | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const [a, b, c] = await Promise.all([
        http.get<EFIR[]>("/admin/efir"),
        http.get<Alert[]>("/admin/alerts", { params: filter ? { status: filter } : {} }),
        http.get<CheckIn[]>("/admin/checkins").catch(() => ({ data: [] as CheckIn[] })),
      ]);
      setEfirs(a.data);
      setAlerts(b.data);
      setCheckins(c.data);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function setStatus(a: Alert, status: "acknowledged" | "resolved") {
    try {
      await http.patch(`/admin/alerts/${a._id}`, { status });
      notify({ tone: "success", message: `Alert ${status}.` });
      load();
    } catch (e: any) {
      notify({ tone: "error", message: e?.response?.data?.error || "Update failed" });
    }
  }

  const openCount = (alerts ?? []).filter((a) => (a.status ?? "open") === "open").length;

  return (
    <>
      <h1 className="page-title">Admin · Control Room</h1>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={load} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter alerts">
          <option value="">All alerts</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        {openCount > 0 && <Badge tone="danger">{openCount} open</Badge>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Alerts (SOS & missed check-ins)" />
          <CardBody>
            {!alerts ? (
              <Loading />
            ) : alerts.length === 0 ? (
              <div className="text-sm text-neutral-600">No alerts.</div>
            ) : (
              <ul className="divide-y">
                {alerts.map((a) => {
                  const status = a.status ?? "open";
                  return (
                    <li key={a._id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {a.type === "checkin_missed" ? "⏱️ Missed check-in" : a.type === "anomaly" ? "📈 Anomaly" : "🚨 SOS"}
                          <Badge tone={statusTone(status) as any}>{status}</Badge>
                          {a.user?.name && <span className="text-neutral-600">· {a.user.name}</span>}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {new Date(a.createdAt).toLocaleString()}
                          {a.lat != null && a.lon != null ? (
                            <>
                              {" · "}
                              <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${a.lat},${a.lon}`}>
                                {a.lat.toFixed(5)}, {a.lon.toFixed(5)}
                              </a>
                            </>
                          ) : (
                            " · No coordinates"
                          )}
                          {a.trailCount ? ` · ${a.trailCount} location update(s)` : ""}
                        </div>
                        {a.message && <div className="mt-1 text-xs text-neutral-600">{a.message}</div>}
                        {a.user?.contacts?.length ? (
                          <div className="mt-1 text-xs text-neutral-600">
                            Contacts:{" "}
                            {a.user.contacts.map((c, i) => (
                              <span key={i}>
                                {i > 0 && ", "}
                                {c.name}{" "}
                                <a className="underline" href={`tel:${c.phone}`}>
                                  {c.phone}
                                </a>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {a.trackUrl && (
                          <a className="text-xs font-medium underline" href={a.trackUrl} target="_blank" rel="noreferrer">
                            Live track
                          </a>
                        )}
                        {status === "open" && (
                          <Button variant="outline" onClick={() => setStatus(a, "acknowledged")}>
                            Acknowledge
                          </Button>
                        )}
                        {(status === "open" || status === "acknowledged") && <Button onClick={() => setStatus(a, "resolved")}>Resolve</Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Active check-ins" />
          <CardBody>
            {!checkins ? (
              <Loading />
            ) : checkins.length === 0 ? (
              <div className="text-sm text-neutral-600">No active timers.</div>
            ) : (
              <ul className="divide-y">
                {checkins.map((c) => {
                  const overdue = new Date(c.dueAt).getTime() < Date.now();
                  return (
                    <li key={c._id} className="py-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {c.user?.name ?? "Traveller"} <Badge tone={c.status === "escalated" ? "danger" : overdue ? "warning" : "success"}>{c.status}</Badge>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {c.label} · due {new Date(c.dueAt).toLocaleTimeString()}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="All e-FIR Submissions" />
        <CardBody>
          {!efirs ? (
            <Loading />
          ) : efirs.length === 0 ? (
            <div className="text-sm text-neutral-600">No e-FIRs.</div>
          ) : (
            <ul className="divide-y">
              {efirs.map((e) => (
                <li key={e._id} className="py-3">
                  <div className="font-medium">
                    {e.name} {e.contact ? <span className="text-xs text-neutral-500">· {e.contact}</span> : null}
                  </div>
                  <div className="text-xs text-neutral-500">{new Date(e.createdAt).toLocaleString()}</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{e.summary || e.description}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
