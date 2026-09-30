import { useEffect, useState } from "react";
import { http } from "@/lib/http";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Loading from "@/components/ui/Loading";
import Button from "@/components/ui/Button";

type EFIR = { _id: string; name: string; contact?: string; summary?: string; description?: string; createdAt: string };
type Alert = { _id: string; userId?: string; lat?: number; lon?: number; createdAt: string; meta?: any };

export default function AdminDashboard() {
  const [efirs, setEfirs] = useState<EFIR[]|null>(null);
  const [alerts, setAlerts] = useState<Alert[]|null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const [a, b] = await Promise.all([
        http.get<EFIR[]>("/admin/efir"),
        http.get<Alert[]>("/admin/alerts"),
      ]);
      setEfirs(a.data); setAlerts(b.data);
    } finally { setBusy(false); }
  }
  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, []);

  return (
    <>
      <h1 className="page-title">Admin</h1>
      <div className="mt-4"><Button variant="outline" onClick={load} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</Button></div>

      <div className="grid gap-6 md:grid-cols-2 mt-6">
        <Card>
          <CardHeader title="Recent SOS Alerts" />
          <CardBody>
            {!alerts ? <Loading /> : alerts.length === 0 ? <div className="text-sm text-neutral-600">No alerts.</div> : (
              <ul className="divide-y">
                {alerts.map(a => (
                  <li key={a._id} className="py-3">
                    <div className="text-sm">
                      {a.lat != null && a.lon != null ? (
                        <a className="underline" target="_blank" rel="noreferrer"
                           href={`https://www.google.com/maps?q=${a.lat},${a.lon}`}>
                          {a.lat.toFixed(5)}, {a.lon.toFixed(5)}
                        </a>
                      ) : "No coordinates"}
                    </div>
                    <div className="text-xs text-neutral-500">{new Date(a.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="All e-FIR Submissions" />
          <CardBody>
            {!efirs ? <Loading /> : efirs.length === 0 ? <div className="text-sm text-neutral-600">No e-FIRs.</div> : (
              <ul className="divide-y">
                {efirs.map(e => (
                  <li key={e._id} className="py-3">
                    <div className="font-medium">{e.name} {e.contact ? <span className="text-xs text-neutral-500">· {e.contact}</span> : null}</div>
                    <div className="text-xs text-neutral-500">{new Date(e.createdAt).toLocaleString()}</div>
                    <p className="mt-2 text-sm whitespace-pre-wrap">{e.summary || e.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
