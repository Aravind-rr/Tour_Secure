import { useEffect, useMemo, useState } from "react";
import { http } from "@/lib/http";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Loading from "@/components/ui/Loading";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { MapPin } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type EFIRDoc = {
  _id: string;
  name?: string;
  contact?: string;
  summary: string;
  status: string;
  createdAt: string;
};

const STORAGE_KEY = "efir_draft_v2";
const MAX_LEN = 1000;

export default function EFIR() {
  const { user } = useAuth();
  const { notify } = useToast();

  // form state
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [summary, setSummary] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  // list state
  const [list, setList] = useState<EFIRDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // list filters
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 6;

  // load draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { name: string; contact: string; summary: string };
        setName(d.name || "");
        setContact(d.contact || "");
        setSummary(d.summary || "");
      }
    } catch {}
  }, []);

  // autosave draft
  useEffect(() => {
    const draft = JSON.stringify({ name, contact, summary });
    localStorage.setItem(STORAGE_KEY, draft);
  }, [name, contact, summary]);

  function clearDraft() {
    localStorage.removeItem(STORAGE_KEY);
    setName("");
    setContact("");
    setSummary("");
    setFiles([]);
    notify({ tone: "info", title: "Draft cleared", message: "All fields reset." });
  }

  /** ---------- load EFIR list ---------- */
  async function load() {
    setLoading(true);
    try {
      const { data } = await http.get("/efir");
      const listData = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : [];
      setList(
        listData
          .map((d: any) => ({
            _id: d._id,
            name: d.name,
            contact: d.contact,
            summary: d.summary || d.description || "",
            status: d.status || "Pending",
            createdAt: d.createdAt || new Date().toISOString(),
          }))
          .sort((a: EFIRDoc, b: EFIRDoc) => +new Date(b.createdAt) - +new Date(a.createdAt))
      );
    } catch (e: any) {
      notify({ tone: "error", message: e?.message ?? "Failed to load e-FIRs" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) load();
    else setLoading(false);
  }, [user]);

  /** ---------- use my location ---------- */
  async function useMyLocation() {
    if (!navigator.geolocation) {
      notify({ tone: "warning", message: "Geolocation not supported." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const add = `\n\nLocation: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        setSummary((s) => (s.includes("Location:") ? s : (s + add).trimStart()));
        notify({ tone: "success", message: "Coordinates added to report." });
      },
      (err) => notify({ tone: "error", message: err.message })
    );
  }

  function onPickFiles(fs: FileList | null) {
    if (!fs || !fs.length) return;
    const arr = Array.from(fs).slice(0, 10);
    setFiles(arr);
  }

  const summaryCount = summary.length;
  const summaryTooLong = summaryCount > MAX_LEN;

  function validate(): string | null {
    if (!name.trim()) return "Name is required.";
    if (!summary.trim()) return "Description is required.";
    if (summaryTooLong) return `Description is too long (max ${MAX_LEN} chars).`;
    return null;
  }

  /** ---------- submit EFIR ---------- */
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      notify({ tone: "warning", message: err });
      return;
    }

    if (!user) {
      notify({ tone: "warning", message: "Please login before submitting an e-FIR." });
      return;
    }

    setBusy(true);
    try {
      let attachments: string[] = [];
      if (files.length) {
        attachments = files.map((f) => f.name);
      }

      const body = {
        name: name.trim(),
        contact: contact.trim() || undefined,
        summary: summary.trim(),
        attachments,
      };

      await http.post("/efir", body);

      notify({ tone: "success", title: "Submitted", message: "Your e-FIR has been recorded." });
      clearDraft();
      await load();
      setPage(1);
    } catch (e: any) {
      notify({ tone: "error", message: e?.message ?? "Failed to submit e-FIR" });
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return list.filter(
      (it) =>
        !ql ||
        it.name?.toLowerCase().includes(ql) ||
        it.contact?.toLowerCase().includes(ql) ||
        it.summary.toLowerCase().includes(ql)
    );
  }, [list, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <h1 className="page-title">e-FIR</h1>

      {/* Top row: Submit + Tools */}
      <div className="grid gap-6 md:grid-cols-3 mt-6">
        <Card className="md:col-span-2">
          <CardHeader
            title="Submit Report"
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={useMyLocation}>
                  <MapPin size={16} className="mr-1" /> Use my location
                </Button>
                <Button variant="outline" onClick={clearDraft}>
                  Clear Draft
                </Button>
              </div>
            }
          />
          <CardBody>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input placeholder="Contact (optional)" value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>

              <div>
                <Textarea
                  className="h-40"
                  placeholder="Describe the incident. Add place, time, people involved, and any identifiers."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  required
                />
                <div className={`mt-1 text-xs ${summaryTooLong ? "text-red-600" : "text-neutral-500"}`}>
                  {summaryCount}/{MAX_LEN}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Attachments (optional)</label>
                <input type="file" multiple accept="image/*,video/*" onChange={(e) => onPickFiles(e.target.files)} />
                {files.length > 0 && (
                  <ul className="grid sm:grid-cols-2 gap-2">
                    {files.map((f, i) => (
                      <li key={i} className="border rounded-lg p-2 text-sm flex items-center justify-between gap-2">
                        <span className="truncate">{f.name}</span>
                        <Badge tone="neutral">{Math.round(f.size / 1024)} KB</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-neutral-500">
                  Tip: filenames will be included in the saved report. (Demo: files are not uploaded.)
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-neutral-500">
                  Do not include sensitive info you don’t wish to store.
                </div>
                <Button type="submit" disabled={busy || !!validate()}>
                  {busy ? "Submitting…" : user ? "Submit" : "Login to submit"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        {/* Quick tips */}
        <Card className="md:col-span-1">
          <CardHeader title="Guidelines" />
          <CardBody>
            <ul className="list-disc pl-5 text-sm space-y-2 text-neutral-700">
              <li>Provide accurate contact details to enable follow-up.</li>
              <li>Use <strong>Use my location</strong> for precise coordinates.</li>
              <li>Keep your summary clear and under {MAX_LEN} characters.</li>
              <li>Avoid posting passwords or personal IDs here.</li>
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* Recent submissions */}
      <Card className="mt-6">
        <CardHeader title="Recent e-FIR Submissions" />
        <CardBody>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Input
              className="w-60"
              placeholder="Search name/contact/text…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <div className="flex-1" />
            {totalPages > 1 && (
              <div className="text-xs text-neutral-500">
                Page {page} of {totalPages}
              </div>
            )}
          </div>

          {loading ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <div className="text-sm text-neutral-600">No submissions found.</div>
          ) : (
            <>
              <ul className="grid md:grid-cols-2 gap-3">
                {pageItems.map((item) => (
                  <li key={item._id} className="border rounded-xl p-4 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{item.name || "Anonymous"}</div>
                        {item.contact ? (
                          <div className="text-xs text-neutral-500">Contact: {item.contact}</div>
                        ) : null}
                        <div className="text-xs text-neutral-500">
                          {new Date(item.createdAt).toLocaleString()} • {item.status}
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-neutral-800 whitespace-pre-wrap break-words">
                      {item.summary}
                    </p>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-neutral-500">{filtered.length} total</div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </>
  );
}
