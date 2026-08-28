import { useRef, useState } from "react";
import { AlertTriangle, MoreHorizontal, RefreshCw } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_LABEL,
  INDICADOR_SAUDE_TONE,
  type StatusAtualizacao,
  indicadorSaudeParaObjetivo,
} from "@/lib/metas-engine";
import { formatMetaVinculo, formatValorAtual, timeAgo } from "./metas-ui-utils";
import { useDropdown } from "./use-dropdown";

const STATUS_LABEL: Record<StatusAtualizacao, string> = {
  atualizado: "Atualizado",
  precisa_atualizar: "Precisa atualizar",
  muito_desatualizado: "Muito desatualizado",
};

const STATUS_TONE: Record<StatusAtualizacao, string> = {
  atualizado: "text-muted-foreground",
  precisa_atualizar: "text-amber-600 dark:text-amber-400",
  muito_desatualizado: "text-rose-600 dark:text-rose-400",
};

/** Resumo de situação agregado — NUNCA um badge único de status global
 * (item 38 do pedido: o mesmo indicador pode estar saudável num
 * objetivo e em risco em outro). "Impacta nenhum objetivo" quando não
 * vinculado — estado normal, não erro. */
function situacaoTexto(objetivos: Objetivo[], indicador: Indicador): string {
  if (objetivos.length === 0) return "Nenhum objetivo";
  let emRisco = 0;
  let saudaveis = 0;
  for (const o of objetivos) {
    const s = indicadorSaudeParaObjetivo(indicador, o.id);
    if (s === "em_risco" || s === "atrasado") emRisco++;
    else if (s === "saudavel" || s === "concluido") saudaveis++;
  }
  if (emRisco === 0)
    return saudaveis === objetivos.length ? "Todos saudáveis" : `${saudaveis} saudáveis`;
  if (emRisco === objetivos.length) return `${emRisco} em risco`;
  return `${emRisco} em risco · ${saudaveis} saudáveis`;
}

/** Linha densa da aba global "Indicadores" — clona o padrão de
 * `ObjetivoIndicadorRow.tsx` (mesmos breakpoints/classes de hover,
 * status-dot, colapso mobile), trocando Meta/Peso (que só fazem
 * sentido dentro de UM objetivo) por Atualização/Impacta/Situação
 * (conceitos do indicador como entidade global). */
export function IndicadorGlobalRow({
  indicador,
  objetivosVinculados,
  status,
  onOpen,
  onQuickUpdate,
  onOpenObjetivo,
}: {
  indicador: Indicador;
  objetivosVinculados: Objetivo[];
  status: StatusAtualizacao;
  onOpen: () => void;
  onQuickUpdate: () => void;
  onOpenObjetivo: (id: string) => void;
}) {
  const valor = formatValorAtual(indicador);
  const situacao = situacaoTexto(objetivosVinculados, indicador);
  const precisaAtenção = status !== "atualizado";

  const [impactoOpen, setImpactoOpen] = useState(false);
  const impactoRef = useRef<HTMLDivElement>(null);
  useDropdown(impactoRef, impactoOpen, () => setImpactoOpen(false));

  return (
    <div className="group flex flex-col gap-1.5 border-b border-border py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2.5 rounded text-left sm:items-center"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{indicador.titulo}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {indicador.dataSource === "auto"
              ? "Sincronizado automaticamente"
              : `Atualizado ${timeAgo(indicador.updatedAt ?? indicador.createdAt)}`}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:hidden">
            <span className="font-medium tabular-nums text-foreground">{valor}</span>
            {precisaAtenção && (
              <span className={`font-medium ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
            )}
            <span className="text-muted-foreground">{situacao}</span>
          </p>
        </div>
        <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-foreground sm:block">
          {valor}
        </span>
        <span
          className={`hidden w-32 shrink-0 text-right text-xs sm:block ${precisaAtenção ? `font-medium ${STATUS_TONE[status]}` : "text-muted-foreground"}`}
        >
          {precisaAtenção && <AlertTriangle className="mr-1 inline h-3 w-3 align-[-1px]" />}
          {STATUS_LABEL[status]}
        </span>
        <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground md:block">
          {situacao}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
        {/* "Impacta" é dado, não ação — sempre visível (item 37: coluna
            permanente), diferente de Atualizar/Abrir (hover, item 41). */}
        <div ref={impactoRef} className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setImpactoOpen((v) => !v);
            }}
            className="rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {objetivosVinculados.length === 0
              ? "Nenhum objetivo"
              : `${objetivosVinculados.length} objetivo${objetivosVinculados.length === 1 ? "" : "s"}`}
          </button>
          {impactoOpen && objetivosVinculados.length > 0 && (
            <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-border bg-popover p-1.5 shadow-md">
              <p className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Usado em
              </p>
              {objetivosVinculados.map((o) => {
                const s = indicadorSaudeParaObjetivo(indicador, o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      setImpactoOpen(false);
                      onOpenObjetivo(o.id);
                    }}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {o.titulo}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {formatMetaVinculo(indicador, o.id) ?? "—"}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${INDICADOR_SAUDE_TONE[s]}`}
                    >
                      {INDICADOR_SAUDE_LABEL[s]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100">
          {indicador.dataSource === "manual" && (
            <button
              type="button"
              onClick={onQuickUpdate}
              title="Atualizar"
              aria-label="Atualizar indicador"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            title="Abrir"
            aria-label="Abrir indicador"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
