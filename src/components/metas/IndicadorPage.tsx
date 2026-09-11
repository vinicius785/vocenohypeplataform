import { useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_DOT,
  INDICADOR_SAUDE_LABEL,
  INDICADOR_SAUDE_TONE,
  indicadorPeso,
  indicadorSaudeParaObjetivo,
  indicadorTendencia,
} from "@/lib/metas-engine";
import { Button } from "@/components/ui/button";
import {
  formatIndicadorValor,
  formatMetaVinculo,
  formatValorAtual,
  timeAgo,
  TENDENCIA_ICON,
  TENDENCIA_TONE,
} from "./metas-ui-utils";
import { IndicadorEvolucao } from "./IndicadorEvolucao";
import { IndicadorHistorico } from "./IndicadorHistorico";
import { IndicadorQuickUpdate, type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { IndicadorAdvancedSettings } from "./IndicadorAdvancedSettings";
import { useDropdown } from "./use-dropdown";

type Member = { name: string; photo?: string };

/** Card compacto de estatística — usado só em Desempenho agora
 * (Acompanhamento migrou pro accordion de Configurações). */
function StatBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/40 p-3.5">
      <p className="text-[11px] text-text-secondary">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDropdown(menuRef, menuOpen, () => setMenuOpen(false));

  return (
    <div className="group flex items-center gap-3 px-1 py-2.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${INDICADOR_SAUDE_DOT[saude]}`} />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{objetivo.titulo}</span>
        <span className="shrink-0 text-xs tabular-nums text-text-secondary">
          {formatMetaVinculo(indicador, objetivo.id) ?? "—"}
        </span>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-secondary">
          {Math.round(peso)}%
        </span>
        <span
          className={`w-20 shrink-0 rounded px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide ${INDICADOR_SAUDE_TONE[saude]}`}
        >
          {INDICADOR_SAUDE_LABEL[saude]}
        </span>
      </button>
      <div ref={menuRef} className="relative shrink-0 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title="Mais ações"
          aria-label="Mais ações"
          aria-expanded={menuOpen}
          className="rounded p-1.5 text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl bg-popover p-1 shadow-lg dark:shadow-none">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpen();
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm font-medium text-foreground hover:bg-muted"
            >
              Abrir
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onUnlink();
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm font-medium text-danger hover:bg-danger-soft"
            >
              Desvincular
            </button>
          </div>
        )}
      </div>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDropdown(menuRef, menuOpen, () => setMenuOpen(false));

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
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" /> {cameFromObjetivo ? cameFromObjetivo.titulo : "Metas"}
      </button>

      {/* Hero — valor em destaque, sem meta/status/barra global: o
          indicador não tem "a" meta, isso é sempre por vínculo (ver
          Objetivos vinculados abaixo). */}
      <div className="rounded-[28px] bg-brand p-6 dark:shadow-none md:p-7">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-brand-foreground md:text-3xl">
            {indicador.titulo}
          </h1>
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Mais ações"
              aria-expanded={menuOpen}
              className="flex h-8 w-8 items-center justify-center rounded-full text-brand-foreground-secondary hover:bg-black/10 hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl bg-popover p-1 text-foreground shadow-lg dark:shadow-none">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm font-medium text-danger hover:bg-danger-soft"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir indicador
                </button>
              </div>
            )}
          </div>
        </div>
        {indicador.descricao && (
          <p className="mt-1.5 max-w-xl text-sm text-brand-foreground-secondary">
            {indicador.descricao}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-baseline gap-2 whitespace-nowrap text-[40px] font-bold leading-none tracking-tight text-brand-foreground">
              {valorPrincipal}
              {tendencia && (
                <span className={`text-sm font-medium ${TENDENCIA_TONE[tendencia.trend]}`}>
                  {TENDENCIA_ICON[tendencia.trend]}{" "}
                  {formatIndicadorValor(
                    indicador.tipo,
                    Math.abs(tendencia.diff),
                    indicador.unidade,
                  )}
                </span>
              )}
            </p>
            <p className="mt-1.5 text-xs text-brand-foreground-secondary">
              {atualizacoes.length > 0
                ? `Atualizado ${timeAgo(indicador.updatedAt ?? indicador.createdAt)} por ${ultimaAtualizacao.author}`
                : `Atualizado ${timeAgo(indicador.updatedAt ?? indicador.createdAt)}`}
              {indicador.calcTotal != null && indicador.calcContagem != null && (
                <span>
                  {" "}
                  · {indicador.calcContagem} de {indicador.calcTotal}
                </span>
              )}
            </p>
          </div>
          {indicador.dataSource === "manual" ? (
            <Button
              size="comfortable"
              className="border-0 bg-background text-brand hover:bg-background/90"
              onClick={() => setUpdateOpen(true)}
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          ) : (
            <p className="text-xs text-brand-foreground-secondary">Sincronizado automaticamente.</p>
          )}
        </div>
      </div>

      {/* Desempenho */}
      {niveisRows.length > 0 && (
        <div className="rounded-[24px] bg-card p-5 dark:shadow-none">
          <h2 className="text-[15px] font-semibold text-foreground">Desempenho</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {niveisRows.map((r) => (
              <StatBlock key={r.label} label={r.label}>
                {formatIndicadorValor(indicador.tipo, r.value, indicador.unidade)}
              </StatBlock>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-[24px] bg-card p-5 dark:shadow-none">
        <IndicadorEvolucao
          atualizacoes={atualizacoes}
          tipo={indicador.tipo}
          unidade={indicador.unidade}
        />
      </div>

      {/* Objetivos vinculados — pode ser mais de um, indicador é
          universal. Deixa explícito que a mesma métrica é reutilizável:
          cada objetivo pode ter sua própria meta/peso/status pro MESMO
          valor atual. */}
      {objetivosVinculados.length > 0 && (
        <div className="rounded-[24px] bg-card p-5 dark:shadow-none">
          <h2 className="text-[15px] font-semibold text-foreground">
            Usado em {objetivosVinculados.length} objetivo
            {objetivosVinculados.length === 1 ? "" : "s"}
          </h2>
          <div className="mt-2.5 divide-y divide-border/60">
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
        </div>
      )}

      {/* Histórico */}
      <div className="rounded-[24px] bg-card p-5 dark:shadow-none">
        <h2 className="text-[15px] font-semibold text-foreground">Histórico</h2>
        {atualizacoes.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">Nenhuma atualização ainda.</p>
        ) : (
          <IndicadorHistorico
            atualizacoes={atualizacoes}
            tipo={indicador.tipo}
            unidade={indicador.unidade}
          />
        )}
      </div>

      {/* Configurações */}
      <div className="rounded-[24px] bg-card dark:shadow-none">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between rounded-[24px] px-5 py-4 text-left text-sm font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Configurações
          {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {advancedOpen && (
          <div className="border-t border-border/60 p-5">
            <IndicadorAdvancedSettings
              indicador={indicador}
              members={members}
              onSave={onSaveAdvanced}
            />
          </div>
        )}
      </div>

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
