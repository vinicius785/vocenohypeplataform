import { RefreshCw } from "lucide-react";
import type { Indicador } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_BAR,
  INDICADOR_SAUDE_DOT,
  INDICADOR_SAUDE_LABEL,
  INDICADOR_SAUDE_TONE,
  indicadorProgressoExibicao,
  indicadorSaude,
} from "@/lib/metas-engine";
import { formatIndicadorValor } from "./metas-ui-utils";

/** Card quadrado de um Indicador — usado em grade (galeria) tanto na
 * página do Objetivo quanto na seção "Indicadores independentes" da tela
 * principal. Clicar no corpo abre a página do indicador; o botão
 * "Atualizar" no rodapé abre a atualização rápida ali mesmo, sem precisar
 * entrar na página — pensado pra digitar vários valores em sequência sem
 * navegar. `dono` é opcional porque um indicador vinculado a um objetivo
 * não tem dono próprio — quem chama passa o dono do objetivo pai. */
export function IndicadorRow({
  indicador,
  dono,
  onOpen,
  onQuickUpdate,
}: {
  indicador: Indicador;
  /** Nome a exibir — o próprio `indicador.dono` (independente) ou o dono
   * do objetivo pai (vinculado). */
  dono?: string;
  onOpen: () => void;
  onQuickUpdate: () => void;
}) {
  const donoNome = dono ?? indicador.dono;
  const saude = indicadorSaude(indicador);
  const progresso = indicadorProgressoExibicao(indicador);
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
    <div className="flex aspect-square flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-0 flex-1 flex-col p-4 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${INDICADOR_SAUDE_DOT[saude]}`} />
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${INDICADOR_SAUDE_TONE[saude]}`}
          >
            {INDICADOR_SAUDE_LABEL[saude]}
          </span>
        </div>

        <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {indicador.titulo}
        </p>

        <div className="mt-auto pt-2">
          <p className="truncate text-xl font-light tracking-tight text-foreground">
            {valor}
            {meta && <span className="text-xs font-normal text-muted-foreground"> / {meta}</span>}
          </p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${INDICADOR_SAUDE_BAR[saude]}`}
              style={{ width: `${progresso}%` }}
            />
          </div>
          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
            {donoNome || "Sem dono"}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onQuickUpdate();
        }}
        className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <RefreshCw className="h-3 w-3" /> Atualizar
      </button>
    </div>
  );
}
