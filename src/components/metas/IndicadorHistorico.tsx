import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { MetaAtualizacao } from "@/lib/metas-store";

/** Lista colapsável de atualizações manuais de um indicador — extraído do
 * card original, sem mudança de comportamento (mesmo padrão de
 * author/initials/valor/nota/data). */
export function IndicadorHistorico({ atualizacoes }: { atualizacoes: MetaAtualizacao[] }) {
  const [open, setOpen] = useState(false);
  if (atualizacoes.length === 0) return null;

  return (
    <div className="border-t border-border px-6 py-3 sm:px-7">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {atualizacoes.length} atualizaç{atualizacoes.length === 1 ? "ão" : "ões"}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {[...atualizacoes].reverse().map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-foreground">
                {a.initials}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-foreground">
                  {a.author}
                  {a.valor !== undefined
                    ? ` atualizou para ${a.valor.toLocaleString("pt-BR")}`
                    : ""}
                  {a.nota ? ` — ${a.nota}` : ""}
                </span>
                <span className="ml-1.5 text-muted-foreground">
                  {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
