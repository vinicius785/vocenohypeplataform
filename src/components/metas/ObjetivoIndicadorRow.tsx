import { useRef, useState } from "react";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import type { Indicador } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_DOT,
  INDICADOR_SAUDE_LABEL,
  INDICADOR_SAUDE_TONE,
  indicadorSaudeParaObjetivo,
  indicadorTendencia,
} from "@/lib/metas-engine";
import {
  formatIndicadorValor,
  formatMetaVinculo,
  formatValorAtual,
  timeAgo,
  TENDENCIA_ICON,
  TENDENCIA_TONE,
} from "./metas-ui-utils";
import { useDropdown } from "./use-dropdown";

/** Linha densa de um indicador DENTRO de um objetivo — substitui o card
 * grande (`IndicadorRow`) só aqui, onde comparar vários indicadores lado
 * a lado importa mais que a leitura isolada de um só. Não é `<table>`
 * HTML (flex/grid responsivo) pra poder colapsar em mobile sem quebrar
 * layout. Status/meta são sempre do VÍNCULO com este objetivo
 * (`indicadorSaudeParaObjetivo`/`formatMetaVinculo`), nunca o valor
 * global do indicador — o mesmo indicador pode aparecer diferente numa
 * linha equivalente de outro objetivo. */
export function ObjetivoIndicadorRow({
  indicador,
  objetivoId,
  peso,
  onOpen,
  onQuickUpdate,
  onUnlink,
}: {
  indicador: Indicador;
  objetivoId: string;
  peso?: number;
  onOpen: () => void;
  onQuickUpdate: () => void;
  onUnlink: () => void;
}) {
  const saude = indicadorSaudeParaObjetivo(indicador, objetivoId);
  const tendencia = indicadorTendencia(indicador);
  const valor = formatValorAtual(indicador);
  const meta = formatMetaVinculo(indicador, objetivoId);
  const pesoLabel = peso != null ? `${Math.round(peso)}%` : null;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDropdown(menuRef, menuOpen, () => setMenuOpen(false));

  return (
    <div className="group flex flex-col gap-1.5 border-b border-border py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2.5 rounded text-left sm:items-center"
      >
        <span
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full sm:mt-0 ${INDICADOR_SAUDE_DOT[saude]}`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{indicador.titulo}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {indicador.dataSource === "auto"
              ? "Sincronizado automaticamente"
              : `Atualizado ${timeAgo(indicador.updatedAt ?? indicador.createdAt)}`}
            {tendencia && (
              <span className={`ml-1.5 font-medium ${TENDENCIA_TONE[tendencia.trend]}`}>
                {TENDENCIA_ICON[tendencia.trend]}{" "}
                {formatIndicadorValor(indicador.tipo, Math.abs(tendencia.diff), indicador.unidade)}
              </span>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:hidden">
            <span className="font-medium tabular-nums text-foreground">{valor}</span>
            {meta && <span className="text-muted-foreground">{meta}</span>}
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${INDICADOR_SAUDE_TONE[saude]}`}
            >
              {INDICADOR_SAUDE_LABEL[saude]}
            </span>
            {pesoLabel && <span className="text-muted-foreground">Peso: {pesoLabel}</span>}
          </p>
        </div>
        <span className="hidden w-16 shrink-0 text-right text-sm tabular-nums text-foreground sm:block">
          {valor}
        </span>
        <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground md:block">
          {meta ?? "—"}
        </span>
        <span
          className={`hidden w-24 shrink-0 rounded px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide sm:block ${INDICADOR_SAUDE_TONE[saude]}`}
        >
          {INDICADOR_SAUDE_LABEL[saude]}
        </span>
        <span className="hidden w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground lg:block">
          {pesoLabel ?? "—"}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 self-end sm:self-auto sm:opacity-0 sm:group-hover:opacity-100">
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
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Mais ações"
            aria-label="Mais ações"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-md">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpen();
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted"
              >
                Abrir
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onUnlink();
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-destructive hover:bg-muted"
              >
                Desvincular deste objetivo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
