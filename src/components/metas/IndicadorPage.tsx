import { useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, MoreHorizontal, Trash2 } from "lucide-react";
import type { Indicador, Objetivo } from "@/lib/metas-store";
import {
  INDICADOR_SAUDE_BAR,
  INDICADOR_SAUDE_LABEL,
  INDICADOR_SAUDE_TONE,
  indicadorProgressoExibicao,
  indicadorSaude,
} from "@/lib/metas-engine";
import { formatIndicadorValor, timeAgo } from "./metas-ui-utils";
import { Avatar } from "./Avatar";
import { IndicadorHistorico } from "./IndicadorHistorico";
import { IndicadorQuickUpdate, type IndicadorQuickPatch } from "./IndicadorQuickUpdate";
import { IndicadorAdvancedSettings } from "./IndicadorAdvancedSettings";
import { useDropdown } from "./use-dropdown";

type Member = { name: string; photo?: string };

/** Rótulo consistente pro nível "esperado" — usado tanto no destaque do
 * topo quanto na grade de Desempenho, pra nunca chamar o mesmo número de
 * duas coisas diferentes na mesma tela. */
function metaLabelFor(tipo: Indicador["tipo"]): string {
  if (tipo === "min") return "Meta (mínimo)";
  if (tipo === "max") return "Meta (máximo)";
  return "Meta esperada";
}

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
 * atualizar, desempenho, acompanhamento (dono/colaboradores herdados ou
 * próprios), histórico completo, e configurações avançadas escondidas
 * atrás de um "mostrar" (progressive disclosure — não aparecem de cara). */
export function IndicadorPage({
  indicador,
  objetivo,
  members,
  onBack,
  onDelete,
  onUpdate,
  onSaveAdvanced,
}: {
  indicador: Indicador;
  /** Objetivo pai, quando vinculado — usado só pra exibir os valores
   * herdados de dono/colaboradores/período/frequência. */
  objetivo?: Objetivo;
  members: Member[];
  onBack: () => void;
  onDelete: () => void;
  onUpdate: (ind: Indicador, patch: IndicadorQuickPatch, nota: string) => void;
  onSaveAdvanced: (ind: Indicador) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDropdown(menuRef, menuOpen, () => setMenuOpen(false));

  const saude = indicadorSaude(indicador);
  const progresso = indicadorProgressoExibicao(indicador);
  const linked = !!indicador.objetivoId;
  const donoNome = linked ? objetivo?.dono : indicador.dono;
  const colaboradoresNomes = linked ? objetivo?.colaboradores : indicador.colaboradores;
  const donoMember = members.find((m) => m.name === donoNome);

  const valorPrincipal =
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

  const showProgressBar = indicador.tipo !== "binario" && indicador.tipo !== "marco";
  const metaLabel = metaLabelFor(indicador.tipo);
  const metaValor =
    indicador.niveis.esperado != null
      ? formatIndicadorValor(indicador.tipo, indicador.niveis.esperado, indicador.unidade)
      : null;

  const niveisRows: { label: string; value: number }[] = [
    { label: "Baseline", value: indicador.niveis.baseline as number },
    { label: "Meta mínima", value: indicador.niveis.minimo as number },
    { label: metaLabel, value: indicador.niveis.esperado as number },
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
          <ArrowLeft className="h-4 w-4" /> {objetivo ? objetivo.titulo : "Metas"}
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
        <Avatar name={donoNome} photo={donoMember?.photo} />
        <span className="text-sm text-muted-foreground">
          {donoNome || "Sem dono"}
          {linked && " · herdado do objetivo"}
        </span>
      </div>
      {indicador.descricao && (
        <p className="mt-2 text-sm text-muted-foreground">{indicador.descricao}</p>
      )}

      {/* Valor em destaque */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-4xl font-light tracking-tight text-foreground">{valorPrincipal}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Atual</p>
        </div>
        {metaValor && (
          <div className="text-right">
            <p className="text-lg font-medium text-foreground">{metaValor}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{metaLabel}</p>
          </div>
        )}
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

      <button
        type="button"
        onClick={() => setUpdateOpen(true)}
        className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
      >
        Atualizar indicador
      </button>

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
              <Avatar name={donoNome} photo={donoMember?.photo} />
              {donoNome || "Sem dono"}
            </span>
          </StatBlock>
          <StatBlock label="Colaboradores">
            {colaboradoresNomes?.length ? colaboradoresNomes.join(", ") : "Nenhum"}
          </StatBlock>
          <StatBlock label="Frequência">
            <span className="capitalize">{indicador.frequencia}</span>
          </StatBlock>
          <StatBlock label="Origem">
            {indicador.dataSource === "manual" ? "Manual" : "Automática"}
          </StatBlock>
        </div>
      </div>

      {/* Histórico */}
      <div className="mt-9">
        <h2 className="text-sm font-semibold text-foreground">Histórico</h2>
        <div className="mt-2.5 rounded-lg border border-border">
          {(indicador.atualizacoes ?? []).length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Nenhuma atualização ainda.</p>
          ) : (
            <IndicadorHistorico atualizacoes={indicador.atualizacoes ?? []} />
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
              members={members}
              onSave={onSaveAdvanced}
            />
          </div>
        )}
      </div>

      <IndicadorQuickUpdate
        indicador={updateOpen ? indicador : null}
        onClose={() => setUpdateOpen(false)}
        onSave={(ind, patch, nota) => {
          setUpdateOpen(false);
          onUpdate(ind, patch, nota);
        }}
      />
    </div>
  );
}
