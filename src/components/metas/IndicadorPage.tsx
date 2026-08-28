import { useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, MoreHorizontal, Trash2 } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_DOT,
  INDICADOR_SAUDE_LABEL,
  INDICADOR_SAUDE_TONE,
  indicadorPeso,
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
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
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
    <div className="group flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${INDICADOR_SAUDE_DOT[saude]}`} />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{objetivo.titulo}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatMetaVinculo(indicador, objetivo.id) ?? "—"}
        </span>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
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
              Desvincular
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Página de acompanhamento de um Indicador — quanto está, como evoluiu,
 * em quais objetivos é usado, como foi atualizado. Não é mais uma tela
 * de configuração: dono/colaboradores/frequência/origem ficam
 * escondidos atrás do accordion "Configurações", e o header nunca
 * mostra status/meta/progresso (isso é sempre por vínculo — ver
 * "Objetivos vinculados"). */
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
    <div className="mx-auto w-full max-w-4xl pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {cameFromObjetivo ? cameFromObjetivo.titulo : "Metas"}
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Mais ações"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-popover p-1 shadow-md">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-medium text-destructive hover:bg-muted"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir indicador
              </button>
            </div>
          )}
        </div>
      </div>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        {indicador.titulo}
      </h1>
      {indicador.descricao && (
        <p className="mt-2 text-sm text-muted-foreground">{indicador.descricao}</p>
      )}

      {/* Valor em destaque — sem meta/status/barra global (item 25): o
          indicador não tem "a" meta, isso é sempre por vínculo (ver
          Objetivos vinculados). */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-baseline gap-2 text-4xl font-light tracking-tight text-foreground">
            {valorPrincipal}
            {tendencia && (
              <span className={`text-sm font-medium ${TENDENCIA_TONE[tendencia.trend]}`}>
                {TENDENCIA_ICON[tendencia.trend]}{" "}
                {formatIndicadorValor(indicador.tipo, Math.abs(tendencia.diff), indicador.unidade)}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Atual
            {indicador.calcTotal != null && indicador.calcContagem != null && (
              <span>
                {" "}
                · {indicador.calcContagem} de {indicador.calcTotal}
              </span>
            )}
          </p>
        </div>
        {indicador.dataSource === "manual" ? (
          <button
            type="button"
            onClick={() => setUpdateOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
          >
            Atualizar
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">Sincronizado automaticamente.</p>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {atualizacoes.length > 0
          ? `Atualizado ${timeAgo(indicador.updatedAt ?? indicador.createdAt)} por ${ultimaAtualizacao.author}`
          : `Atualizado ${timeAgo(indicador.updatedAt ?? indicador.createdAt)}`}
      </p>

      {/* Desempenho */}
      {niveisRows.length > 0 && (
        <div className="mt-9">
          <h2 className="text-sm font-semibold text-foreground">Desempenho</h2>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            {niveisRows.map((r) => (
              <StatBlock key={r.label} label={r.label}>
                {formatIndicadorValor(indicador.tipo, r.value, indicador.unidade)}
              </StatBlock>
            ))}
          </div>
        </div>
      )}

      <IndicadorEvolucao
        atualizacoes={atualizacoes}
        tipo={indicador.tipo}
        unidade={indicador.unidade}
      />

      {/* Objetivos vinculados — pode ser mais de um, indicador é
          universal. Deixa explícito que a mesma métrica é reutilizável:
          cada objetivo pode ter sua própria meta/peso/status pro MESMO
          valor atual. */}
      {objetivosVinculados.length > 0 && (
        <div className="mt-9">
          <h2 className="text-sm font-semibold text-foreground">
            Usado em {objetivosVinculados.length} objetivo
            {objetivosVinculados.length === 1 ? "" : "s"}
          </h2>
          <div className="mt-2.5 divide-y divide-border rounded-lg border border-border">
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
      <div className="mt-9">
        <h2 className="text-sm font-semibold text-foreground">Histórico</h2>
        <div className="mt-2.5 rounded-lg border border-border">
          {atualizacoes.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Nenhuma atualização ainda.</p>
          ) : (
            <IndicadorHistorico
              atualizacoes={atualizacoes}
              tipo={indicador.tipo}
              unidade={indicador.unidade}
            />
          )}
        </div>
      </div>

      {/* Configurações */}
      <div className="mt-9">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/40"
        >
          Configurações
          {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {advancedOpen && (
          <div className="mt-3 rounded-lg border border-border p-4">
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
