import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { MetaAtualizacao } from "@/lib/metas-store";
import { formatIndicadorValor } from "./metas-ui-utils";

/** Lista colapsável de atualizações manuais de um indicador — o gráfico
 * de evolução mora em `IndicadorEvolucao.tsx` (seção própria, sempre
 * visível), este componente é só o texto ("quem, quando, pra qual
 * valor"), colapsado por padrão pra não competir com o resto da
 * página. */
export function IndicadorHistorico({
  atualizacoes,
  tipo,
  unidade,
}: {
  atualizacoes: MetaAtualizacao[];
  tipo: "numero" | "percentual" | "moeda" | "min" | "max" | "binario" | "marco" | "manual";
  unidade?: string;
}) {
  const [open, setOpen] = useState(false);

  if (atualizacoes.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded text-xs text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                    ? ` atualizou para ${formatIndicadorValor(tipo, a.valor, unidade)}`
                    : ""}
                  {a.nota ? ` — ${a.nota}` : ""}
                </span>
                <span className="ml-1.5 text-text-secondary">
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
