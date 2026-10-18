import { Link } from "react-router-dom";
import { Bot, ShieldAlert } from "lucide-react";
import ChatPanel from "@/components/assistant/ChatPanel";

export default function Assistant() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Bot className="text-neutral-400" /> AI Assistant
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Your travel-safety companion: category recommendations, day plans, area safety, and emergency help — grounded in Tour Secure data.
          </p>
        </div>
        <Link to="/explore" className="text-sm font-medium underline underline-offset-2">
          Browse recommendations visually →
        </Link>
      </div>
      <div className="h-[calc(100dvh-15rem)] min-h-[520px]">
        <ChatPanel variant="page" />
      </div>
      <p className="flex items-start gap-2 text-xs text-neutral-500">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" /> The assistant can make mistakes and never contacts authorities by itself. In an emergency call 112 or use the SOS button.
      </p>
    </>
  );
}
