// frontend/src/components/ReviewWidget.tsx
import { useEffect, useRef, useState } from "react";
import { submitReview } from "@/services/reviews";
import { API_BASE } from "@/lib/api";

type Suggestion = { name: string; lat: number; lng: number; safety_score: number };

export default function ReviewWidget() {
  const [place, setPlace] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Autocomplete
  const [openSuggest, setOpenSuggest] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const suggestAbortRef = useRef<AbortController | null>(null);

  // After submit: show what score the backend currently has for this place
  const [lastSubmitted, setLastSubmitted] = useState<Suggestion | null>(null);

  // Debounced search to reduce calls
  useEffect(() => {
    const q = place.trim();
    if (!q) {
      setSuggestions([]);
      setOpenSuggest(false);
      return;
    }
    const id = setTimeout(async () => {
      try {
        suggestAbortRef.current?.abort();
        const ac = new AbortController();
        suggestAbortRef.current = ac;

        const r = await fetch(`${API_BASE}/safety-scores/search?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
          headers: { "Cache-Control": "no-store" },
        });
        const data = await r.json();
        if (Array.isArray(data)) {
          setSuggestions(data);
          setOpenSuggest(true);
        } else {
          setSuggestions([]);
          setOpenSuggest(false);
        }
      } catch {
        // ignore
      }
    }, 250);
    return () => clearTimeout(id);
  }, [place]);

  function pickSuggestion(s: Suggestion) {
    setPlace(s.name);
    setOpenSuggest(false);
    setSuggestions([]);
    setLastSubmitted(null); // reset
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const p = place.trim();
    if (!p) {
      setErrorMsg("Please enter an area name (e.g., 'Shillong, Meghalaya').");
      return;
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      setErrorMsg("Rating must be between 1 and 5.");
      return;
    }

    setLoading(true);
    try {
      await submitReview(p, rating, comment);
      setComment("");

      // Immediately fetch the backend's current score for this place
      try {
        const r = await fetch(`${API_BASE}/safety-scores/search?q=${encodeURIComponent(p)}`, {
          headers: { "Cache-Control": "no-store" },
        });
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          setLastSubmitted(data[0]); // the best match
        } else {
          setLastSubmitted({ name: p, lat: 0, lng: 0, safety_score: 0 });
        }
      } catch {
        // ignore
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Submit failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form
        onSubmit={onSubmit}
        className="relative flex flex-col md:flex-row gap-2 items-stretch md:items-center p-3 bg-white/90 rounded-xl shadow"
      >
        <div className="relative flex-1">
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="Area name (e.g., Shillong, Meghalaya)"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            onBlur={() => setTimeout(() => setOpenSuggest(false), 150)}
            onFocus={() => suggestions.length && setOpenSuggest(true)}
          />
          {/* Autocomplete dropdown */}
          {openSuggest && suggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow max-h-64 overflow-auto">
              {suggestions.map((s, i) => (
                <button
                  key={`${s.name}-${i}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(s)}
                  className="w-full text-left px-3 py-2 hover:bg-neutral-100"
                >
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs opacity-70">Safety Score: {s.safety_score}/100</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <select
          className="border rounded px-3 py-2 md:w-36"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}★
            </option>
          ))}
        </select>

        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Comment (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        <button
          className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-60"
          disabled={loading || !place.trim() || rating < 1}
        >
          {loading ? "Submitting..." : "Submit"}
        </button>
      </form>

      {/* Error / success footer */}
      <div className="mt-2 text-sm">
        {errorMsg && <div className="text-red-600">{errorMsg}</div>}
        {lastSubmitted && !errorMsg && (
          <div className="text-green-700">
            Updated <b>{lastSubmitted.name}</b>. Current Safety Score:{" "}
            <b>{lastSubmitted.safety_score}</b>/100
          </div>
        )}
      </div>
    </div>
  );
}
