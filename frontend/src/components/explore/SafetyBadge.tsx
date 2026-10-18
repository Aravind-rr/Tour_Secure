import { SAFETY_UI, type SafetyLevel } from "@/lib/categories";

export default function SafetyBadge({ level, score, compact = false, title }: { level: SafetyLevel; score?: number; compact?: boolean; title?: string }) {
  const ui = SAFETY_UI[level] ?? SAFETY_UI.moderate;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${ui.cls}`}
      title={title ?? `Tour Secure safety estimate${score !== undefined ? `: ${score}/100` : ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ui.dot}`} aria-hidden />
      {compact ? (score ?? ui.label) : `${ui.label}${score !== undefined ? ` · ${score}` : ""}`}
    </span>
  );
}
