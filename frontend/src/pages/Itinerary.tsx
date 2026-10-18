// frontend/src/pages/Itinerary.tsx
import { useEffect, useMemo, useState } from "react";
import { http } from "@/lib/http";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Loading from "@/components/ui/Loading";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { Link } from "react-router-dom";
import { MapPin, Trash2, Sparkles, Compass, Bot } from "lucide-react";
import { ALL_CATEGORIES, CATEGORY_UI, catUi } from "@/lib/categories";
import SafetyBadge from "@/components/explore/SafetyBadge";

/* ------------ types & API ------------ */
type Item = {
  _id: string;
  title: string;
  date?: string;        // "YYYY-MM-DD"
  time?: string;        // "HH:MM"
  location?: string;
  notes?: string;
  category?: string;
  done?: boolean;
  source?: string;
  safety?: { score: number; level: "safe" | "moderate" | "caution" | "unsafe"; zone: string | null; advice: string[] };
  createdAt: string;
};

async function fetchItems(): Promise<Item[]> {
  const { data } = await http.get("/itinerary", { params: { withSafety: 1 } }); // use shared client
  const arr = Array.isArray(data) ? data : (data?.items ?? []); // always an array
  return (arr as Item[]).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

async function createItem(input: { title: string; date?: string; time?: string; location?: string; notes?: string; category?: string }) {
  const { data } = await http.post("/itinerary", input); // use shared client
  return (data?.item ?? data) as Item; // accept either shape
}

/* ------------ page ------------ */
export default function Itinerary() {
  const { notify } = useToast();

  // list
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(true);

  // add form
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [time, setTime] = useState("");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // filters
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"date-asc" | "date-desc" | "created-desc">("date-asc");

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const list = await fetchItems();
        if (!alive) return;
        setItems(list);
      } catch (e: any) {
        notify({ tone: "error", message: e?.response?.data?.error || e?.message || "Failed to load itinerary" });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [notify, reloadKey]);

  // reload when items are added from Explore / the assistant
  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener("itinerary:changed", h);
    return () => window.removeEventListener("itinerary:changed", h);
  }, []);

  /** Persisted done toggle (optimistic). */
  async function toggleDone(it: Item) {
    const next = !it.done;
    setItems((s) => (s ?? []).map((x) => (x._id === it._id ? { ...x, done: next } : x)));
    try {
      await http.patch(`/itinerary/${it._id}`, { done: next });
    } catch (e: any) {
      setItems((s) => (s ?? []).map((x) => (x._id === it._id ? { ...x, done: !next } : x)));
      notify({ tone: "error", message: e?.response?.data?.error || "Could not update item" });
    }
  }

  async function removeItem(it: Item) {
    if (!window.confirm(`Delete "${it.title}" from your itinerary?`)) return;
    try {
      await http.delete(`/itinerary/${it._id}`);
      setItems((s) => (s ?? []).filter((x) => x._id !== it._id));
      notify({ tone: "success", message: "Item deleted." });
    } catch (e: any) {
      notify({ tone: "error", message: e?.response?.data?.error || "Could not delete item" });
    }
  }

  const filteredSorted = useMemo(() => {
    const data = (items ?? []).slice();
    // filter
    const ql = q.trim().toLowerCase();
    const inRange = (d?: string) => {
      if (!d) return true;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    };
    const filtered = data.filter(it =>
      (ql ? it.title.toLowerCase().includes(ql) || it.location?.toLowerCase().includes(ql) || it.notes?.toLowerCase().includes(ql) : true) &&
      inRange(it.date)
    );
    // sort
    filtered.sort((a, b) => {
      if (sort === "created-desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      const da = a.date ?? "";
      const db = b.date ?? "";
      const ta = a.time ?? "99:99";
      const tb = b.time ?? "99:99";
      if (sort === "date-asc")  return da.localeCompare(db) || ta.localeCompare(tb) || a.title.localeCompare(b.title);
      return db.localeCompare(da) || tb.localeCompare(ta) || a.title.localeCompare(b.title);
    });
    return filtered;
  }, [items, q, from, to, sort]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of filteredSorted) {
      const key = it.date || "No date";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredSorted]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      notify({ tone: "warning", message: "Title is required." });
      return;
    }
    try {
      setSubmitting(true);
      const created = await createItem({
        title: title.trim(),
        date: date || undefined,
        time: time || undefined,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        category: category || undefined,
      });
      setItems((s) => [created, ...(s ?? [])]);
      setTitle(""); setDate(""); setTime(""); setLocation(""); setNotes(""); setCategory("");
      setReloadKey((k) => k + 1); // refresh to pick up server-side safety badge
      notify({ tone: "success", title: "Added", message: "Itinerary item created." });
    } catch (e: any) {
      notify({ tone: "error", message: e?.response?.data?.error || e?.message || "Failed to add item" });
    } finally {
      setSubmitting(false);
    }
  }

  function quickToday() {
    setDate(new Date().toISOString().slice(0, 10));
  }

  function mapsUrl(loc?: string) {
    return loc ? `https://www.google.com/maps/search/${encodeURIComponent(loc)}` : "#";
  }

  /* ---------- export helpers ---------- */
  function download(filename: string, content: string, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCSV() {
    const rows = [["Title", "Date", "Time", "Category", "Location", "Notes"]];
    (filteredSorted).forEach(it => {
      rows.push([it.title, it.date ?? "", it.time ?? "", it.category ?? "", it.location ?? "", (it.notes ?? "").replace(/\n/g, " ")]);
    });
    const csv = rows.map(r => r.map(x => `"${(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    download("itinerary.csv", csv, "text/csv");
  }

  function exportICS() {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Tour Secure//Itinerary//EN",
    ];
    filteredSorted.forEach((it, i) => {
      if (!it.date) return;
      const dt = it.date.replace(/-/g, "");
      const uid = `${it._id || i}-${dt}@tour-secure`;
      const tm = it.time && /^\d{2}:\d{2}$/.test(it.time) ? it.time.replace(":", "") + "00" : null;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${toUTCString(new Date())}`,
        tm ? `DTSTART:${dt}T${tm}` : `DTSTART;VALUE=DATE:${dt}`,
        `SUMMARY:${escapeICS(it.title)}`,
        it.location ? `LOCATION:${escapeICS(it.location)}` : "",
        it.notes ? `DESCRIPTION:${escapeICS(it.notes)}` : "",
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    download("itinerary.ics", lines.filter(Boolean).join("\r\n"), "text/calendar");
  }

  function toUTCString(d: Date) {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return (
      d.getUTCFullYear().toString() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  }
  function escapeICS(s: string) {
    return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">Itinerary</h1>
        <div className="flex flex-wrap gap-2">
          <Link to="/explore?tab=itinerary" className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50">
            <Sparkles size={16} className="text-amber-500" /> Recommendations for my trip
          </Link>
          <Link to="/explore?tab=plan" className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50">
            <Compass size={16} /> Auto-plan days
          </Link>
          <Link to="/assistant" className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
            <Bot size={16} /> Plan with AI
          </Link>
        </div>
      </div>

      {/* Top row: Add + Filters/Export */}
      <div className="grid gap-6 md:grid-cols-3 mt-6">
        <Card className="md:col-span-1">
          <CardHeader title="Add Itinerary Item" />
          <CardBody>
            <form onSubmit={onSubmit} className="space-y-3">
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <div className="flex gap-3">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <Button variant="outline" type="button" onClick={quickToday}>Today</Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" className="min-w-0" />
                <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full min-w-0" aria-label="Category">
                  <option value="">Category (auto)</option>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_UI[c].emoji} {CATEGORY_UI[c].label}</option>
                  ))}
                </Select>
              </div>
              <Input placeholder="Location (city or landmark)" value={location} onChange={(e) => setLocation(e.target.value)} />
              <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <Button type="submit" disabled={submitting}>{submitting ? "Adding…" : "Add"}</Button>
              <p className="text-xs text-neutral-500">Tip: add a city or landmark so we can show a safety score and nearby ideas.</p>
            </form>
          </CardBody>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader title="Filters & Export" />
          <CardBody>
            <div className="flex flex-wrap items-end gap-3">
              <Input className="w-60" placeholder="Search title, location, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="flex items-center gap-2">
                <div className="text-xs text-neutral-500">From</div>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-neutral-500">To</div>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <Select value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="date-asc">Sort by date ↑</option>
                <option value="date-desc">Sort by date ↓</option>
                <option value="created-desc">Newest created</option>
              </Select>

              <div className="flex-1" />
              <Button variant="outline" onClick={exportCSV}>Export CSV</Button>
              <Button variant="outline" onClick={exportICS}>Export ICS</Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="mt-6">
        <CardHeader title="Your Itinerary" />
        <CardBody>
          {loading ? (
            <Loading />
          ) : !items || items.length === 0 ? (
            <div className="text-sm text-neutral-600">No items yet.</div>
          ) : (
            <div className="relative">
              {/* timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-[2px] bg-neutral-200" aria-hidden />
              <div className="space-y-6">
                {groupedByDate.map(([day, list]) => (
                  <section key={day} className="pl-10">
                    <header className="mb-2">
                      <Badge tone="neutral">{day}</Badge>
                    </header>
                    <ul className="space-y-3">
                      {list.map((it) => {
                        const isDone = !!it.done;
                        const ui = catUi(it.category);
                        return (
                          <li key={it._id} className="relative">
                            {/* dot */}
                            <span
                              className={`absolute left-3.5 top-3 -translate-x-1/2 w-3 h-3 rounded-full border ${isDone ? "bg-emerald-500 border-emerald-500" : "bg-white border-neutral-300"}`}
                              aria-hidden
                            />
                            <div className="rounded-xl border p-4 bg-white">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {it.time && <span className="text-xs font-semibold text-neutral-500 tabular-nums">{it.time}</span>}
                                    <div className={`font-semibold truncate ${isDone ? "line-through text-neutral-500" : ""}`}>
                                      {it.title}
                                    </div>
                                    {ui && (
                                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ui.soft}`}>
                                        {ui.emoji} {ui.short}
                                      </span>
                                    )}
                                    {it.safety && <SafetyBadge level={it.safety.level} score={it.safety.score} title={it.safety.advice?.join(" ") || undefined} />}
                                  </div>
                                  <div className="text-xs text-neutral-500">
                                    {it.location ? (
                                      <a
                                        href={mapsUrl(it.location)}
                                        target="_blank"
                                        className="inline-flex items-center gap-1 underline underline-offset-2"
                                        rel="noreferrer"
                                      >
                                        <MapPin size={14} /> {it.location}
                                      </a>
                                    ) : (
                                      <span>No location</span>
                                    )}
                                    {" · "}
                                    {new Date(it.createdAt).toLocaleString()}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {!isDone && (
                                    <Link
                                      to={`/explore?tab=itinerary&item=${it._id}`}
                                      className="hidden sm:inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                                      title="Recommendations near this stop"
                                    >
                                      <Sparkles size={14} /> Ideas nearby
                                    </Link>
                                  )}
                                  <Button
                                    variant="outline"
                                    onClick={() => toggleDone(it)}
                                    title={isDone ? "Mark as not done" : "Mark as done"}
                                  >
                                    {isDone ? "Undo" : "Done"}
                                  </Button>
                                  <button
                                    onClick={() => removeItem(it)}
                                    className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                                    aria-label={`Delete ${it.title}`}
                                    title="Delete"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                              {it.notes && (
                                <p className={`mt-2 text-sm whitespace-pre-wrap ${isDone ? "line-through text-neutral-500" : "text-neutral-700"}`}>
                                  {it.notes}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
