import { ALL_CATEGORIES, CATEGORY_UI, type CategoryId } from "@/lib/categories";

type Props = {
  value: CategoryId[];
  onChange: (next: CategoryId[]) => void;
  options?: CategoryId[];
  size?: "sm" | "md";
};

/** Multi-select category pills. Empty selection = "All". */
export default function CategoryChips({ value, onChange, options = ALL_CATEGORIES, size = "md" }: Props) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  const toggle = (c: CategoryId) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Categories">
      <button
        type="button"
        onClick={() => onChange([])}
        className={`rounded-full border font-medium transition ${pad} ${value.length === 0 ? "bg-neutral-900 text-white border-neutral-900" : "bg-white hover:bg-neutral-50 border-neutral-300"}`}
        aria-pressed={value.length === 0}
      >
        All
      </button>
      {options.map((c) => {
        const ui = CATEGORY_UI[c];
        const on = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            aria-pressed={on}
            className={`rounded-full border font-medium transition ${pad} ${on ? ui.chip : "bg-white hover:bg-neutral-50 border-neutral-300 text-neutral-800"}`}
          >
            <span aria-hidden className="mr-1">{ui.emoji}</span>
            {ui.short}
          </button>
        );
      })}
    </div>
  );
}
