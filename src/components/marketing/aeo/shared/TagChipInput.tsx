import { useState } from "react";
import { X } from "lucide-react";

/** Input de tags controlado — Enter ou vírgula adiciona um chip (trim +
 * dedup + ignora vazio), cada chip com botão de remover. Não existia
 * nenhum componente equivalente no projeto (grep confirmado) — usado por
 * "Concorrentes citados" e "Fontes utilizadas" no drawer de resposta. */
export function TagChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const nome = draft.trim();
    setDraft("");
    if (!nome) return;
    if (value.some((v) => v.toLowerCase() === nome.toLowerCase())) return;
    onChange([...value, nome]);
  };

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1 focus-within:ring-2 focus-within:ring-ring">
      {value.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== v))}
            aria-label={`Remover ${v}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="h-6 min-w-[80px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
