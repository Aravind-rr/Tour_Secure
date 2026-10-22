// frontend/src/pages/DigitalID.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Loading from "@/components/ui/Loading";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";

import {
  createDigitalId,
  getMyDigitalId,
  revokeMyDigitalId,
  refreshQr,
  extendTrip,
  uploadDocument,
} from "@/services/digitalId";

type DigitalId = {
  id: string;
  walletAddress: string;
  entrypoint?: string | null;
  docType?: string | null;
  startAt: string; // ISO
  endAt: string;   // ISO
  status: "active" | "expired" | "revoked";
  docFilePath?: string | null;
  qr?: {
    verifyUrl: string;
    dataUrl?: string;
    expiresAt: string; // ISO
  } | null;
};

export default function DigitalIDPage() {
  const { notify } = useToast();
  const { user } = useAuth();
  const nav = useNavigate();

  // page state
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [digitalId, setDigitalId] = useState<DigitalId | null>(null);

  // create form state
  const [entrypoint, setEntrypoint] = useState("Airport");
  const [docType, setDocType] = useState("Passport");
  const [startAtLocal, setStartAtLocal] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [endAtLocal, setEndAtLocal] = useState(() => {
    const d = new Date(Date.now() + 72 * 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });

  // extras
  const [newEndAtLocal, setNewEndAtLocal] = useState(() =>
    new Date(Date.now() + 96 * 3600 * 1000).toISOString().slice(0, 16)
  );
  const [file, setFile] = useState<File | null>(null);

  // derived
  const now = Date.now();
  const activeWindow = useMemo(() => {
    if (!digitalId) return false;
    const s = new Date(digitalId.startAt).getTime();
    const e = new Date(digitalId.endAt).getTime();
    return s <= now && now <= e && digitalId.status === "active";
  }, [digitalId, now]);

  // initial fetch
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const current = await getMyDigitalId();
        if (!alive) return;
        setDigitalId(current);
      } catch (e: any) {
        const status = e?.response?.status;
        const msg =
          e?.response?.data?.error ||
          e?.message ||
          "Failed to load Digital ID";
        if (status === 401) {
          // session missing/invalid -> send to login
          notify({ tone: "error", message: "Please sign in to view Digital ID." });
          nav("/login", { replace: true, state: { from: { pathname: "/digital-id" } } });
          return;
        }
        notify({ tone: "error", message: msg });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // actions
  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await createDigitalId({
        entrypoint,
        docType,
        startAt: new Date(startAtLocal).toISOString(),
        endAt: new Date(endAtLocal).toISOString(),
      });
      setDigitalId(created);
      notify({ tone: "success", title: "Digital ID created", message: "QR generated and time-bound." });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "Failed to create";
      notify({ tone: "error", message: msg });
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke() {
    if (!digitalId) return;
    setBusy(true);
    try {
      await revokeMyDigitalId();
      const cur = await getMyDigitalId();
      setDigitalId(cur);
      notify({ tone: "success", message: "Digital ID revoked." });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "Failed to revoke";
      notify({ tone: "error", message: msg });
    } finally {
      setBusy(false);
    }
  }

  async function onRefreshQr() {
    if (!digitalId) return;
    setBusy(true);
    try {
      const updated = await refreshQr(digitalId.id);
      setDigitalId(updated);
      notify({ tone: "success", message: "QR refreshed." });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "Failed to refresh QR";
      notify({ tone: "error", message: msg });
    } finally {
      setBusy(false);
    }
  }

  async function onExtend(e: React.FormEvent) {
    e.preventDefault();
    if (!digitalId) return;
    setBusy(true);
    try {
      const updated = await extendTrip(digitalId.id, new Date(newEndAtLocal).toISOString());
      setDigitalId(updated);
      notify({ tone: "success", message: "Trip extended & QR updated." });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "Failed to extend trip";
      notify({ tone: "error", message: msg });
    } finally {
      setBusy(false);
    }
  }

  async function onUpload() {
    if (!digitalId || !file) return;
    setBusy(true);
    try {
      const updated = await uploadDocument(digitalId.id, file);
      setDigitalId(updated);
      notify({ tone: "success", message: "Document uploaded." });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "Upload failed";
      notify({ tone: "error", message: msg });
    } finally {
      setBusy(false);
    }
  }

  // UI
  if (loading) {
    return (
      <>
        <h1 className="page-title">Digital ID</h1>
        <Loading />
      </>
    );
  }

  if (!user) {
    // Guard fallback (should rarely hit if router guard is in place)
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <div className="text-sm text-neutral-600">Please sign in to access Digital ID.</div>
      </div>
    );
  }

  return (
    <>
      <h1 className="page-title">Digital ID</h1>

      <div className="grid gap-6 md:grid-cols-2 mt-6">
        {/* Create Form */}
        <Card>
          <CardHeader title="Create a Digital Trip ID" />
          <CardBody>
            <form onSubmit={onCreate} className="grid gap-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-neutral-600 mb-1">Entrypoint</div>
                  <Select value={entrypoint} onChange={(e) => setEntrypoint(e.target.value)}>
                    <option>Airport</option>
                    <option>Railway Station</option>
                    <option>Bus Terminal</option>
                    <option>Border</option>
                    <option>Hotel</option>
                    <option>Checkpost</option>
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-neutral-600 mb-1">Document Type</div>
                  <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
                    <option>Passport</option>
                    <option>Aadhaar</option>
                    <option>Driver’s License</option>
                    <option>Govt ID</option>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-neutral-600 mb-1">Start (local)</div>
                  <Input
                    type="datetime-local"
                    value={startAtLocal}
                    onChange={(e) => setStartAtLocal(e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-neutral-600 mb-1">End (local)</div>
                  <Input
                    type="datetime-local"
                    value={endAtLocal}
                    onChange={(e) => setEndAtLocal(e.target.value)}
                  />
                </div>
              </div>

              <div className="text-xs text-neutral-600">
                Wallet address is assigned automatically to your account. The QR is valid only between Start and End.
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? "Creating…" : "Create Digital ID"}
                </Button>
                {digitalId?.status === "active" && (
                  <Button variant="outline" type="button" disabled={busy} onClick={onRevoke}>
                    Revoke
                  </Button>
                )}
              </div>
            </form>
          </CardBody>
            </Card>

        {/* Current DID */}
        <Card>
          <CardHeader title="Your Digital ID" />
          <CardBody>
            {!digitalId ? (
              <div className="text-sm text-neutral-600">
                No Digital ID yet. Create one on the left.
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="text-sm grid gap-1">
                  <div>
                    <span className="text-neutral-500">Status:</span> {digitalId.status}
                  </div>
                  <div>
                    <span className="text-neutral-500">Valid:</span>{" "}
                    {new Date(digitalId.startAt).toLocaleString()} →{" "}
                    {new Date(digitalId.endAt).toLocaleString()}
                  </div>
                  <div>
                    <span className="text-neutral-500">Wallet:</span> {digitalId.walletAddress}
                  </div>
                  {digitalId.entrypoint && (
                    <div>
                      <span className="text-neutral-500">Entrypoint:</span>{" "}
                      {digitalId.entrypoint}
                    </div>
                  )}
                  {digitalId.docType && (
                    <div>
                      <span className="text-neutral-500">Doc Type:</span>{" "}
                      {digitalId.docType}
                    </div>
                  )}
                  {digitalId.docFilePath && (
                    <div>
                      <span className="text-neutral-500">Document:</span>{" "}
                      {digitalId.docFilePath}
                    </div>
                  )}
                </div>

                {/* QR */}
                {digitalId.qr?.dataUrl && activeWindow ? (
                  <div className="mt-2">
                    <img
                      src={digitalId.qr.dataUrl}
                      alt="Digital ID QR"
                      className="w-56 h-56 border rounded-lg bg-white"
                    />
                    <div className="text-xs text-neutral-500 mt-2">
                      QR expires at {new Date(digitalId.qr.expiresAt).toLocaleString()}
                    </div>
                    <div className="text-xs">
                      <a className="underline" href={digitalId.qr.verifyUrl} target="_blank" rel="noreferrer">
                        Open verification URL
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-neutral-600">
                    {digitalId.status !== "active"
                      ? "Digital ID is not active."
                      : "QR not available (outside the validity window). Refresh QR if needed."}
                  </div>
                )}

                {/* Extras */}
                <div className="mt-3 grid gap-3">
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={busy || !digitalId} onClick={onRefreshQr}>
                      Refresh QR
                    </Button>
                  </div>

                  <form onSubmit={onExtend} className="flex items-end gap-2">
                    <div className="flex-1">
                      <div className="text-xs text-neutral-600 mb-1">Extend End (local)</div>
                      <Input
                        type="datetime-local"
                        value={newEndAtLocal}
                        onChange={(e) => setNewEndAtLocal(e.target.value)}
                      />
                    </div>
                    <Button type="submit" variant="outline" disabled={busy || !digitalId}>
                      Extend Trip
                    </Button>
                  </form>

                  <div className="flex items-center gap-2">
                    <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <Button variant="outline" disabled={busy || !digitalId || !file} onClick={onUpload}>
                      Upload Document
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
