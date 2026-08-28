import { useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, MoreHorizontal, Trash2 } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_BAR,
  INDICADOR_SAUDE_DOT,
  INDICADOR_SAUDE_LABEL,
  INDICADOR_SAUDE_TONE,
  indicadorPeso,
  indicadorPerformanceParaObjetivo,
  indicadorProgressoExibicao,
  indicadorSaude,
  indicadorSaudeParaObjetivo,
  indicadorTendencia,
  metaEfetiva,
} from "@/lib/metas-engine";
import {
  formatIndicadorValor,
  formatMetaVinculo,
  formatValorAtual,
  timeAgo,
  TENDENCIA_ICON,
  TENDENCIA_TONE,
} from "./metas-ui-utils";
import { Avatar } from "./Avatar";
import { IndicadorHistorico } from "./IndicadorHistorico";
import { IndicadorQuickUpdate, type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { IndicadorAdvancedSettings } from "./IndicadorAdvancedSettings";
import { useDropdown } from "./use-dropdown";

type Member = { name: string; photo?: string };

/** Card compacto de estatística — mesmo bloco reaproveitado em Desempenho
 * e Acompanhamento, pra manter os dois grids visualmente idênticos em vez
 * de cada seção inventar seu próprio layout. */
function StatBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

/** Página de gestão de um Indicador — valor atual em destaque + ação de
 * atualizar, desempenho, acompanhamento (sempre do próprio indicador —
 * "universal" não herda mais de nenhum objetivo), histórico completo, e
 * configurações avançadas escondidas atrás de um "mostrar" (progressive
 * disclosure — não aparecem de cara). */
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
  /** De qual objetivo esta página foi aberta (se foi) — rotula o botão
   * "voltar" E dá o contexto pra mostrar meta/status/progresso DESTE
   * vínculo em vez do fallback global (não é "o" objetivo do indicador,
   * que pode ter vários — ver `objetivosVinculados`). */
  cameFromObjetivo?: Objetivo;
  /** TODOS os objetivos que este indicador alimenta hoje. */
  objetivosVinculados: Objetivo[];
  /** Todos os indicadores do app — só pra calcular o peso EFETIVO de
   * `indicador` dentro de cada objetivo vinculado na tabela "Vinculado
   * a" (precisa dos "irmãos" daquele objetivo pra saber a divisão igual
   * quando não há peso explícito, mesma função que `ObjetivoPage` usa). */
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

  // Aberto a partir de um objetivo: status/progresso refletem O VÍNCULO
  // com ELE (mesma meta/operador mostrados na lista densa do objetivo).
  // Sem contexto (aberto da lista de indicadores independentes), cai no
  // fallback global do próprio indicador — nunca um "status canônico"
  // fixo, já que a saúde depende de qual objetivo está sendo olhado.
  const saude = cameFromObjetivo
    ? indicadorSaudeParaObjetivo(indicador, cameFromObjetivo.id)
    : indicadorSaude(indicador);
  const progresso = cameFromObjetivo
    ? Math.max(
        0,
        Math.min(100, indicadorPerformanceParaObjetivo(indicador, cameFromObjetivo.id) ?? 0),
      )
    : indicadorProgressoExibicao(indicador);
  const tendencia = indicadorTendencia(indicador);
  const donoMember = members.find((m) => m.name === indicador.dono);

  const valorPrincipal = formatValorAtual(indicador);
  const showProgressBar = indicador.tipo !== "binario" && indicador.tipo !== "marco";
  // Meta CONTEXTUAL — só existe quando a página foi aberta a partir de um
  // objetivo específico. O indicador em si não tem "a" meta (item 19 do
  // pedido) — cada objetivo pode ter a sua.
  const metaContextual = cameFromObjetivo
    ? formatMetaVinculo(indicador, cameFromObjetivo.id)
    : null;

  const niveisRows: { label: string; value: number }[] = [
    { label: "Baseline", value: indicador.niveis.baseline as number },
    { label: "Meta mínima", value: indicador.niveis.minimo as number },
    { label: "Meta de excelência", value: indicador.niveis.excelencia as number },
  ].filter((r) => r.value != null);

  return (
    <div className="mx-auto w-full max-w-2xl pb-10">
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

      {/* Título + dono */}
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        {indicador.titulo}
      </h1>
      <div className="mt-2 flex items-center gap-2">
        <Avatar name={indicador.dono} photo={donoMember?.photo} />
        <p className="text-sm text-muted-foreground">{indicador.dono || "Sem dono"}</p>
      </div>
      {indicador.descricao && (
        <p className="mt-2 text-sm text-muted-foreground">{indicador.descricao}</p>
      )}

      {/* Valor em destaque */}
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
      </div>

      {showProgressBar && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${INDICADOR_SAUDE_BAR[saude]}`}
            style={{ width: `${progresso}%` }}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${INDICADOR_SAUDE_TONE[saude]}`}
        >
          ● {INDICADOR_SAUDE_LABEL[saude]}
        </span>
        <span className="text-xs text-muted-foreground">
          Atualizado {timeAgo(indicador.updatedAt ?? indicador.createdAt)}
        </span>
      </div>
      {/* Meta CONTEXTUAL — só aparece vindo de um objetivo específico,
          deixando claro que não é "a" meta do indicador (item 19). */}
      {cameFromObjetivo && metaContextual && (
        <p className="mt-2 text-xs text-muted-foreground">
          Meta em <span className="font-medium text-foreground">{cameFromObjetivo.titulo}</span>:{" "}
          {metaContextual}
        </p>
      )}

      {indicador.dataSource === "manual" ? (
        <button
          type="button"
          onClick={() => setUpdateOpen(true)}
          className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
        >
          Atualizar indicador
        </button>
      ) : (
        <p className="mt-5 text-xs text-muted-foreground">Sincronizado automaticamente.</p>
      )}

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

      {/* Acompanhamento */}
      <div className="mt-9">
        <h2 className="text-sm font-semibold text-foreground">Acompanhamento</h2>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <StatBlock label="Dono">
            <span className="flex items-center gap-1.5">
              <Avatar name={indicador.dono} photo={donoMember?.photo} />
              {indicador.dono || "Sem dono"}
            </span>
          </StatBlock>
          <StatBlock label="Colaboradores">
            {indicador.colaboradores?.length ? indicador.colaboradores.join(", ") : "Nenhum"}
          </StatBlock>
          <StatBlock label="Frequência">
            <span className="capitalize">{indicador.frequencia}</span>
          </StatBlock>
          <StatBlock label="Origem">
            {indicador.dataSource === "manual" ? "Manual" : "Automática"}
          </StatBlock>
        </div>
      </div>

      {/* Vinculado a — pode ser mais de um objetivo, indicador é universal.
          Deixa explícito que a mesma métrica é reutilizável: cada objetivo
          pode ter sua própria meta/peso/status pro MESMO valor atual. */}
      {objetivosVinculados.length > 0 && (
        <div className="mt-9">
          <h2 className="text-sm font-semibold text-foreground">
            Usado em {objetivosVinculados.length} objetivo
            {objetivosVinculados.length === 1 ? "" : "s"}
          </h2>
          <div className="mt-2.5 divide-y divide-border rounded-lg border border-border">
            {objetivosVinculados.map((o) => {
              const irmaos = allIndicadores.filter((i) => i.objetivoIds?.includes(o.id));
              const pesoObj = indicadorPeso(indicador, irmaos, o.id);
              const saudeObj = indicadorSaudeParaObjetivo(indicador, o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onOpenObjetivo(o.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${INDICADOR_SAUDE_DOT[saudeObj]}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {o.titulo}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatMetaVinculo(indicador, o.id) ?? "—"}
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {Math.round(pesoObj)}%
                  </span>
                  <span
                    className={`w-20 shrink-0 rounded px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide ${INDICADOR_SAUDE_TONE[saudeObj]}`}
                  >
                    {INDICADOR_SAUDE_LABEL[saudeObj]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Histórico */}
      <div className="mt-9">
        <h2 className="text-sm font-semibold text-foreground">Histórico</h2>
        <div className="mt-2.5 rounded-lg border border-border">
          {(indicador.atualizacoes ?? []).length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Nenhuma atualização ainda.</p>
          ) : (
            <IndicadorHistorico
              atualizacoes={indicador.atualizacoes ?? []}
              tipo={indicador.tipo}
              unidade={indicador.unidade}
              metaEsperada={
                cameFromObjetivo ? metaEfetiva(indicador, cameFromObjetivo.id) : undefined
              }
            />
          )}
        </div>
      </div>

      {/* Configurações avançadas */}
      <div className="mt-9">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/40"
        >
          Configurações avançadas
          {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {advancedOpen && (
          <div className="mt-3 rounded-lg border border-border p-4">
            <IndicadorAdvancedSettings
              indicador={indicador}
              objetivosVinculados={objetivosVinculados}
              members={members}
              onSave={onSaveAdvanced}
              onUnlinkObjetivo={onUnlinkObjetivo}
            />
          </div>
        )}
      </div>

      <IndicadorQuickUpdate
        indicador={updateOpen ? indicador : null}
        onClose={() => setUpdateOpen(false)}
        onSave={(ind, patch, nota, dataISO) => {
          setUpdateOpen(false);
          onUpdate(ind, patch, nota, dataISO);
        }}
      />
    </div>
  );
}
