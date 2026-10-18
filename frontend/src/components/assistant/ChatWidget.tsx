// Floating launcher + panel for the assistant, available on every page.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, X } from "lucide-react";
import ChatPanel from "./ChatPanel";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  // close on navigation (e.g. after tapping an in-app action)
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the full-page assistant and public tracking pages don't need the bubble
  if (loc.pathname.startsWith("/assistant") || loc.pathname.startsWith("/track")) return null;

  return (
    <>
      {open && (
        <div
          className="fixed inset-x-2 bottom-20 top-16 z-[150] flex flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:top-auto sm:h-[min(640px,calc(100dvh-7rem))] sm:w-[400px]"
          role="dialog"
          aria-label="Tour Secure assistant"
        >
          <ChatPanel variant="widget" />
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-[160] grid h-14 w-14 place-items-center rounded-full bg-neutral-900 text-white shadow-xl transition hover:scale-105"
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
      >
        {open ? <X /> : <MessageCircle />}
      </button>
    </>
  );
}
