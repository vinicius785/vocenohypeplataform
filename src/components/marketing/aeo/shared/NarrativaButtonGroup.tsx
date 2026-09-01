import { AEO_NARRATIVAS, AEO_NARRATIVA_LABEL, type AeoNarrativa } from "@/lib/aeo-store";

export function NarrativaButtonGroup({
  value,
  onChange,
}: {
  value?: AeoNarrativa;
  onChange: (v: AeoNarrativa) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-md border border-border p-0.5">
      {AEO_NARRATIVAS.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === n
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {AEO_NARRATIVA_LABEL[n]}
        </button>
      ))}
    </div>
  );
}
