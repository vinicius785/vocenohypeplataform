import type { Indicador } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_DOT,
  INDICADOR_SAUDE_LABEL,
  INDICADOR_SAUDE_TONE,
  indicadorSaude,
} from "@/lib/metas-engine";
import { formatIndicadorValor } from "./metas-ui-utils";

/** Linha compacta de um Indicador — usada dentro da página do Objetivo e
 * na seção "Indicadores independentes" da tela principal. Só nome, valor/
 * meta e saúde; qualquer ação (atualizar, editar, histórico) acontece na
 * página do próprio indicador depois de clicar. */
export function IndicadorRow({ indicador, onOpen }: { indicador: Indicador; onOpen: () => void }) {
  const saude = indicadorSaude(indicador);
  const valor =
    indicador.tipo === "binario"
      ? indicador.concluido
        ? "Concluído"
        : "Em aberto"
      : indicador.tipo === "marco"
        ? indicador.marcoStatus === "concluido"
          ? "Concluído"
          : indicador.marcoStatus === "em_andamento"
            ? "Em andamento"
            : "Não iniciado"
        : formatIndicadorValor(indicador.tipo, indicador.valorAtual, indicador.unidade);
  const meta =
    indicador.niveis.esperado != null && indicador.tipo !== "binario" && indicador.tipo !== "marco"
      ? formatIndicadorValor(indicador.tipo, indicador.niveis.esperado, indicador.unidade)
      : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:border-foreground/30"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${INDICADOR_SAUDE_DOT[saude]}`} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{indicador.titulo}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {valor}
        {meta ? ` / ${meta}` : ""}
      </span>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${INDICADOR_SAUDE_TONE[saude]}`}
      >
        {INDICADOR_SAUDE_LABEL[saude]}
      </span>
    </button>
  );
}
