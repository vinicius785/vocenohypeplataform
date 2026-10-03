import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_DOT,
  INDICADOR_SAUDE_LABEL,
  indicadorPeso,
  indicadorSaudeParaObjetivo,
  indicadorTendencia,
} from "@/lib/metas-engine";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  formatIndicadorValor,
  formatMetaVinculo,
  formatValorAtual,
  saudeAlertaClass,
  timeAgo,
  TENDENCIA_ICON,
  TENDENCIA_TONE,
} from "./metas-ui-utils";
import { IndicadorEvolucao } from "./IndicadorEvolucao";
import { IndicadorHistorico } from "./IndicadorHistorico";
import { IndicadorQuickUpdate, type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { IndicadorAdvancedSettings } from "./IndicadorAdvancedSettings";

type Member = { name: string; photo?: string };

/** Uma linha de "Objetivos vinculados" — meta/peso/status DESTE vínculo
 * (nunca um valor global), com hover revelando "Abrir"/"Desvincular"
 * (mesmo padrão de `ObjetivoIndicadorRow`). */
function ObjetivoVinculadoRow({
  objetivo,
  indicador,
  peso,
  onOpen,
  onUnlink,
}: {
  objetivo: Objetivo;
  indicador: Indicador;
  peso: number;
  onOpen: () => void;
  onUnlink: () => void;
}) {
  const saude = indicadorSaudeParaObjetivo(indicador, objetivo.id);
  const alerta = saudeAlertaClass(saude);

  return (
    <div className="group flex items-center gap-3 py-2.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${INDICADOR_SAUDE_DOT[saude]}`} />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{objetivo.titulo}</span>
        <span className="shrink-0 text-xs tabular-nums text-text-secondary">
          {formatMetaVinculo(indicador, objetivo.id) ?? "—"}
        </span>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-secondary">
          {Math.round(peso)}%
        </span>
        <span className={`w-20 shrink-0 text-right text-xs font-medium ${alerta ?? ""}`}>
          {alerta ? INDICADOR_SAUDE_LABEL[saude] : ""}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Mais ações"
            aria-label="Mais ações"
            className="shrink-0 rounded p-1.5 text-text-secondary opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group-hover:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpen}>Abrir</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onUnlink} className="text-destructive focus:text-destructive">
            Desvincular
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Página de acompanhamento de um Indicador — quanto está, como evoluiu,
 * em quais objetivos é usado, como foi atualizado. Não é uma tela de
 * configuração: dono/colaboradores/frequência/origem ficam escondidos
 * atrás do accordion "Configurações", e o hero nunca mostra status/
 * meta/progresso (isso é sempre por vínculo — ver "Objetivos
 * vinculados"). */
export function IndicadorPage({
  indicador,
  cameFromObjetivo,
  objetivosVinculados,
  allIndicadores,
  members,
  onBack,
  onOpenObjetivo,
  onDelete,
  onUpdate,
  onSaveAdvanced,
  onUnlinkObjetivo,
}: {
  indicador: Indicador;
  /** De qual objetivo esta página foi aberta (se foi) — só pra rotular o
   * botão "voltar". */
  cameFromObjetivo?: Objetivo;
  /** TODOS os objetivos que este indicador alimenta hoje. */
  objetivosVinculados: Objetivo[];
  /** Todos os indicadores do app — só pra calcular o peso EFETIVO de
   * `indicador` dentro de cada objetivo vinculado (precisa dos
   * "irmãos" daquele objetivo pra saber a divisão igual quando não há
   * peso explícito, mesma função que `ObjetivoPage` usa). */
  allIndicadores: Indicador[];
  members: Member[];
  onBack: () => void;
  onOpenObjetivo: (id: string) => void;
  onDelete: () => void;
  onUpdate: (ind: Indicador, patch: IndicadorQuickPatch, nota: string, dataISO: string) => void;
  onSaveAdvanced: (ind: Indicador) => void;
  onUnlinkObjetivo: (objetivoId: string) => void;
}) {
  const [updateOpen, setUpdateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const tendencia = indicadorTendencia(indicador);
  const valorPrincipal = formatValorAtual(indicador);
  const atualizacoes = indicador.atualizacoes ?? [];
  const ultimaAtualizacao = atualizacoes[atualizacoes.length - 1];

  const niveisRows: { label: string; value: number }[] = [
    { label: "Baseline", value: indicador.niveis.baseline as number },
    { label: "Meta mínima", value: indicador.niveis.minimo as number },
    { label: "Meta de excelência", value: indicador.niveis.excelencia as number },
  ].filter((r) => r.value != null);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" /> {cameFromObjetivo ? cameFromObjetivo.titulo : "Metas"}
      </button>

      {/* Identidade + valor atual — sem "hero" colorido. O indicador não tem
       * "a" meta (isso é sempre por vínculo — ver "Usado em"), então aqui
       * entram só: qual é, quanto está, quando foi atualizado e como
       * atualizar. */}
      <header className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              role="heading"
              aria-level={1}
              className="text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl"
            >
              {indicador.titulo}
            </p>
            {indicador.descricao && (
              <p className="mt-1.5 max-w-2xl text-sm text-text-secondary">{indicador.descricao}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {indicador.dataSource === "manual" && (
              <Button variant="primary" size="sm" onClick={() => setUpdateOpen(true)}>
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Mais ações"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary/80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir indicador
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 whitespace-nowrap text-4xl font-semibold leading-none tracking-tight text-foreground">
            {valorPrincipal}
            {tendencia && (
              <span className={`text-sm font-medium ${TENDENCIA_TONE[tendencia.trend]}`}>
                {TENDENCIA_ICON[tendencia.trend]}{" "}
                {formatIndicadorValor(indicador.tipo, Math.abs(tendencia.diff), indicador.unidade)}
              </span>
            )}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {indicador.dataSource === "auto"
              ? "Sincronizado automaticamente"
              : atualizacoes.length > 0
                ? `Atualizado ${timeAgo(indicador.updatedAt ?? indicador.createdAt)} por ${ultimaAtualizacao.author}`
                : `Atualizado ${timeAgo(indicador.updatedAt ?? indicador.createdAt)}`}
            {indicador.calcTotal != null && indicador.calcContagem != null && (
              <span>
                {" "}
                · {indicador.calcContagem} de {indicador.calcTotal}
              </span>
            )}
          </p>
          {niveisRows.length > 0 && (
            <p className="mt-1 text-sm text-text-secondary">
              {niveisRows
                .map(
                  (r) =>
                    `${r.label} ${formatIndicadorValor(indicador.tipo, r.value, indicador.unidade)}`,
                )
                .join(" · ")}
            </p>
          )}
        </div>
      </header>

      <section className="border-t border-border/60 pt-6">
        <IndicadorEvolucao
          atualizacoes={atualizacoes}
          tipo={indicador.tipo}
          unidade={indicador.unidade}
        />
        <IndicadorHistorico
          atualizacoes={atualizacoes}
          tipo={indicador.tipo}
          unidade={indicador.unidade}
        />
      </section>

      {objetivosVinculados.length > 0 && (
        <section className="border-t border-border/60 pt-6">
          <p role="heading" aria-level={2} className="text-[15px] font-semibold text-foreground">
            Usado em {objetivosVinculados.length} objetivo
            {objetivosVinculados.length === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 text-sm text-text-secondary">
            Meta, peso e situação de cada objetivo para este mesmo valor.
          </p>
          <div className="mt-2 divide-y divide-border/60">
            {objetivosVinculados.map((o) => {
              const irmaos = allIndicadores.filter((i) => i.objetivoIds?.includes(o.id));
              return (
                <ObjetivoVinculadoRow
                  key={o.id}
                  objetivo={o}
                  indicador={indicador}
                  peso={indicadorPeso(indicador, irmaos, o.id)}
                  onOpen={() => onOpenObjetivo(o.id)}
                  onUnlink={() => onUnlinkObjetivo(o.id)}
                />
              );
            })}
          </div>
        </section>
      )}

      <section className="border-t border-border/60 pt-4">
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded py-1 text-left text-sm font-medium text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Configurações
              {advancedOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <IndicadorAdvancedSettings
              indicador={indicador}
              members={members}
              onSave={onSaveAdvanced}
            />
          </CollapsibleContent>
        </Collapsible>
      </section>

      <IndicadorQuickUpdate
        indicador={updateOpen ? indicador : null}
        objetivosVinculados={objetivosVinculados}
        onClose={() => setUpdateOpen(false)}
        onSave={(ind, patch, nota, dataISO) => {
          setUpdateOpen(false);
          onUpdate(ind, patch, nota, dataISO);
        }}
      />
    </div>
  );
}
