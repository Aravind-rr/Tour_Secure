// frontend/src/components/assistant/ChatPanel.tsx
// The AI travel-safety assistant conversation UI (used by the floating widget
// and the full-page /assistant route).
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Loader2, LocateFixed, Send, Trash2, User as UserIcon } from "lucide-react";
import Markdownish from "./Markdownish";
import PlaceCardView from "@/components/explore/PlaceCard";
import PlanView from "@/components/explore/PlanView";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useSos } from "@/context/SosContext";
import { useAuth } from "@/context/AuthContext";
import { assistantStatus, sendChat, type AssistantAction, type AssistantReply } from "@/services/assistant";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: AssistantReply["cards"];
  plan?: AssistantReply["plan"];
  actions?: AssistantAction[];
  suggestions?: string[];
  engine?: "claude" | "offline";
  notice?: string;
  error?: boolean;
};

const STORE_KEY = "ts_chat_v1";
const STARTERS = [
  "Recommend historic places near me",
  "Where can I eat good local food nearby?",
  "Plan a 2-day trip in Shillong with nature and food",
  "Is it safe here at night?",
  "Emergency numbers",
];

function loadHistory(): Msg[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(-40) : [];
  } catch {
    return [];
  }
}
function saveHistory(msgs: Msg[]) {
  try {
    // keep text + small payloads; drop plans to stay well within storage limits
    localStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-40).map((m) => ({ ...m, plan: undefined }))));
  } catch {
    /* ignore quota / private mode */
  }
}
const uid = () => Math.random().toString(36).slice(2);

export default function ChatPanel({ variant = "page" }: { variant?: "page" | "widget" }) {
  const [msgs, setMsgs] = useState<Msg[]>(loadHistory);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<{ engine: "claude" | "offline"; model?: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const geo = useGeolocation();
  const sos = useSos();
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    assistantStatus().then(setEngine);
  }, []);
  useEffect(() => {
    saveHistory(msgs);
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { id: uid(), role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const now = new Date();
      const r = await sendChat(
        next.filter((m) => !m.error).slice(-12).map((m) => ({ role: m.role, content: m.content })),
        {
          ...(geo.coords ? { lat: geo.coords.lat, lng: geo.coords.lng, locationLabel: geo.label } : {}),
          localTime: now.toLocaleString(),
          hour: now.getHours(),
          page: loc.pathname,
        }
      );
      setMsgs((m) => [
        ...m,
        { id: uid(), role: "assistant", content: r.reply, cards: r.cards, plan: r.plan, actions: r.actions, suggestions: r.suggestions, engine: r.engine, notice: r.notice },
      ]);
      if (r.itineraryChanged) window.dispatchEvent(new CustomEvent("itinerary:changed"));
    } catch (e: any) {
      const status = e?.response?.status;
      setMsgs((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          error: true,
          content:
            status === 429
              ? "You're sending messages quickly — please wait a few seconds."
              : "I couldn't reach the server. **If this is an emergency, call 112.**",
          actions: [{ type: "call", label: "📞 Call 112", href: "tel:112" }],
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function runAction(a: AssistantAction) {
    if (a.type === "sos") sos.arm();
    else if (a.type === "route") nav(a.to);
    else window.open(a.href, a.type === "call" ? "_self" : "_blank", "noreferrer");
  }

  const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
  const suggestions = msgs.length === 0 ? STARTERS : lastAssistant?.suggestions ?? [];
  const isWidget = variant === "widget";

  return (
    <div className={`flex h-full min-h-0 flex-col ${isWidget ? "" : "rounded-2xl border bg-white shadow-sm"}`}>
      {/* header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-neutral-900 text-white">
          <Bot size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Tour Secure Assistant</div>
          <div className="truncate text-[11px] text-neutral-500">
            {engine?.engine === "claude" ? `AI · ${engine.model}` : "Offline mode · rule-based answers"}
            {" · "}
            {geo.coords ? `📍 ${geo.label || "location set"}` : "location not shared"}
          </div>
        </div>
        {!geo.coords && (
          <button onClick={geo.locate} className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100" title="Share my location" aria-label="Share my location">
            <LocateFixed size={16} />
          </button>
        )}
        {msgs.length > 0 && (
          <button onClick={() => setMsgs([])} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100" title="Clear conversation" aria-label="Clear conversation">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* messages */}
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.length === 0 && (
          <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
            <div className="font-semibold">Hi{user?.name ? ` ${user.name.split(" ")[0]}` : ""}! 👋</div>
            <p className="mt-1">
              Ask me for <b>places by category</b> (historic, food, fun, entertainment…), a <b>day-by-day plan</b>, how <b>safe</b> an area is, or help in an
              <b> emergency</b>. {!user && "Sign in to let me read and update your itinerary."}
            </p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-white">
                <Bot size={14} />
              </div>
            )}
            <div className={`min-w-0 ${m.role === "user" ? "max-w-[85%]" : "max-w-full flex-1"}`}>
              <div
                className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user" ? "rounded-br-sm bg-neutral-900 text-white" : m.error ? "rounded-bl-sm bg-red-50 text-red-900" : "rounded-bl-sm bg-neutral-100 text-neutral-900"
                }`}
              >
                {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : <Markdownish text={m.content} />}
              </div>
              {m.notice && <div className="mt-1 text-[11px] text-orange-700">{m.notice}</div>}

              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.actions.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => runAction(a)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${a.type === "sos" ? "bg-red-600 text-white hover:bg-red-700" : a.type === "call" ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "border border-neutral-300 bg-white hover:bg-neutral-50"}`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}

              {m.cards && m.cards.length > 0 && (
                <div className={`mt-3 grid gap-2 ${isWidget ? "grid-cols-1" : "sm:grid-cols-2"}`}>
                  {m.cards.slice(0, isWidget ? 4 : 6).map((c) => (
                    <PlaceCardView key={c.id} place={c} compact />
                  ))}
                </div>
              )}

              {m.plan && (
                <div className="mt-3 rounded-xl border bg-white p-3">
                  <PlanView plan={m.plan} showMap={!isWidget} compact={isWidget} />
                </div>
              )}
            </div>
            {m.role === "user" && (
              <div className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-200 text-neutral-700">
                <UserIcon size={14} />
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 size={16} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      {/* quick replies */}
      {suggestions.length > 0 && !busy && (
        <div className="flex gap-2 overflow-x-auto border-t px-4 py-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="shrink-0 rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs hover:bg-neutral-50">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* composer */}
      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Ask about places, plans or safety…"
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-black focus:ring-1 focus:ring-black"
          aria-label="Message"
        />
        <button type="submit" disabled={busy || !input.trim()} className="grid h-10 w-10 place-items-center rounded-xl bg-neutral-900 text-white disabled:opacity-40" aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
