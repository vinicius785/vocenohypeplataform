import { AlertTriangle, MoreHorizontal, RefreshCw } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_LABEL,
  type StatusAtualizacao,
  indicadorSaudeParaObjetivo,
} from "@/lib/metas-engine";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMetaVinculo, formatValorAtual, saudeAlertaClass, timeAgo } from "./metas-ui-utils";

const STATUS_LABEL: Record<StatusAtualizacao, string> = {
  atualizado: "Atualizado",
  precisa_atualizar: "Precisa atualizar",
  muito_desatualizado: "Muito desatualizado",
};

const STATUS_TONE: Record<StatusAtualizacao, string> = {
  atualizado: "text-text-secondary",
  precisa_atualizar: "text-warning",
  muito_desatualizado: "text-danger",
};

/** Resumo de situação agregado — NUNCA um badge único de status global
 * (o mesmo indicador pode estar saudável num objetivo e em risco em
 * outro). "Impacta nenhum objetivo" quando não vinculado — estado
 * normal, não erro. */
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

/** Linha estruturada da aba global "Indicadores" — alinhada às mesmas 6
 * colunas do cabeçalho (`IndicadoresView`): Indicador / Valor atual /
 * Atualização / Saúde / Objetivos vinculados / Ações. "Saúde" aqui é
 * sempre um resumo textual (nunca um badge único — o mesmo indicador
 * pode estar saudável num objetivo e em risco em outro, então um único
 * selo coloriria a linha inteira de forma enganosa). Colapsa pra um
 * cartão empilhado abaixo de `sm:` preservando todos os valores. */
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

  return (
    <div className="group grid grid-cols-1 items-center gap-1.5 py-3 sm:grid-cols-[1fr_5.5rem_6rem_6rem_9rem_2rem] sm:gap-3 sm:py-2.5">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <p className="truncate text-sm font-medium text-foreground">{indicador.titulo}</p>
        <p className="mt-0.5 truncate text-[11px] text-text-secondary">
          {indicador.dataSource === "auto"
            ? "Sincronizado automaticamente"
            : `Atualizado ${timeAgo(indicador.updatedAt ?? indicador.createdAt)}`}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:hidden">
          <span className="font-medium tabular-nums text-foreground">{valor}</span>
          {precisaAtenção && (
            <span className={`font-medium ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
          )}
          <span className="text-text-secondary">{situacao}</span>
        </p>
      </button>
      <span className="hidden text-right text-sm tabular-nums text-foreground sm:block">
        {valor}
      </span>
      <span
        className={`hidden text-right text-xs sm:block ${precisaAtenção ? `font-medium ${STATUS_TONE[status]}` : "text-text-secondary"}`}
      >
        {precisaAtenção && <AlertTriangle className="mr-1 inline h-3 w-3 align-[-1px]" />}
        {STATUS_LABEL[status]}
      </span>
      <span className="hidden text-center text-xs text-text-secondary sm:block">{situacao}</span>
      <div>
        {/* "Objetivos vinculados" é dado, não ação — sempre visível,
            diferente de Atualizar/Abrir (só no hover, desktop). */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded px-1.5 py-1 text-left text-[11px] font-medium text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {objetivosVinculados.length === 0
                ? "Nenhum objetivo"
                : `${objetivosVinculados.length} objetivo${objetivosVinculados.length === 1 ? "" : "s"}`}
            </button>
          </PopoverTrigger>
          {objetivosVinculados.length > 0 && (
            <PopoverContent align="end" className="w-72 p-1.5">
              <p className="px-1.5 pb-1 text-xs font-medium text-text-secondary">Usado em</p>
              {objetivosVinculados.map((o) => {
                const sd = indicadorSaudeParaObjetivo(indicador, o.id);
                const alerta = saudeAlertaClass(sd);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onOpenObjetivo(o.id)}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {o.titulo}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-text-secondary">
                      {formatMetaVinculo(indicador, o.id) ?? "—"}
                    </span>
                    {alerta && (
                      <span className={`shrink-0 text-[11px] font-medium ${alerta}`}>
                        {INDICADOR_SAUDE_LABEL[sd]}
                      </span>
                    )}
                  </button>
                );
              })}
            </PopoverContent>
          )}
        </Popover>
      </div>
      <div className="flex items-center justify-end gap-0.5 sm:opacity-0 sm:group-hover:opacity-100">
        {indicador.dataSource === "manual" && (
          <button
            type="button"
            onClick={onQuickUpdate}
            title="Atualizar"
            aria-label="Atualizar indicador"
            className="rounded p-1.5 text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          title="Abrir"
          aria-label="Abrir indicador"
          className="rounded p-1.5 text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
