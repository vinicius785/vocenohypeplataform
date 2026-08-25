import { Calendar, Check, Pencil, Target, TrendingUp, Trash2 } from "lucide-react";
import type { Indicador, MetaItem } from "@/lib/metas-store";
import {
  indicadorProgressoExibicao,
  indicadorSaude,
  INDICADOR_SAUDE_BAR,
  INDICADOR_SAUDE_DOT,
  INDICADOR_SAUDE_LABEL,
  INDICADOR_SAUDE_TONE,
  objetivoProgresso,
  objetivoStats,
} from "@/lib/metas-engine";
import { IndicadorHistorico } from "./IndicadorHistorico";
import { fmtDate, formatIndicadorValor, initialsOf } from "./metas-ui-utils";

type Member = { name: string; photo?: string };

function Avatar({ name, photo }: { name?: string; photo?: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-foreground ring-1 ring-border">
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : name ? (
        initialsOf(name) || "?"
      ) : (
        <Target className="h-4 w-4 text-muted-foreground" />
      )}
    </span>
  );
}

/** Card de um Objetivo — progresso ponderado dos indicadores + resumo de
 * saúde + lista compacta dos indicadores vinculados. */
function ObjetivoCard({
  item,
  indicadores,
  members,
  onEdit,
  onDelete,
  onOpenChild,
}: {
  item: Extract<MetaItem, { kind: "objetivo" }>;
  indicadores: Indicador[];
  members: Member[];
  onEdit: () => void;
  onDelete: () => void;
  onOpenChild: (ind: Indicador) => void;
}) {
  const progresso = objetivoProgresso(item.id, indicadores);
  const stats = objetivoStats(item.id, indicadores);
  const donoMember = members.find((m) => m.name === item.dono);
  // Resumo de saúde do objetivo como um todo: pior caso entre os
  // indicadores manda — um objetivo só está "saudável" se nenhum
  // indicador dele estiver em risco/atrasado.
  const resumoSaude = item.cancelado
    ? "cancelado"
    : stats.emRisco > 0 || stats.atrasados > 0
      ? "em_risco"
      : stats.atencao > 0
        ? "atencao"
        : stats.total > 0 && stats.concluidos === stats.total
          ? "concluido"
          : stats.total === 0
            ? "nao_iniciado"
            : "saudavel";

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex-1 p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar name={item.dono} photo={donoMember?.photo} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {item.dono || "Sem dono"}
                {(item.colaboradores?.length ?? 0) > 0 && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    +{item.colaboradores!.length}
                  </span>
                )}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{item.area} · Objetivo</p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${INDICADOR_SAUDE_TONE[resumoSaude]}`}
          >
            {INDICADOR_SAUDE_LABEL[resumoSaude]}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Editar objetivo"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Excluir objetivo"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <h3 className="mt-5 text-2xl font-light tracking-tighter text-foreground">{item.titulo}</h3>
        {item.descricao && <p className="mt-1.5 text-sm text-muted-foreground">{item.descricao}</p>}

        <div className="mt-6">
          <span className="text-5xl font-light tracking-tight text-foreground">
            {progresso == null ? "—" : Math.round(progresso)}
          </span>
          {progresso != null && (
            <span className="text-base font-medium text-muted-foreground"> % de progresso</span>
          )}
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${INDICADOR_SAUDE_BAR[resumoSaude]}`}
            style={{ width: `${Math.max(0, Math.min(100, progresso ?? 0))}%` }}
          />
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {stats.saudaveis > 0 && <span>🟢 {stats.saudaveis}</span>}
          {stats.atencao > 0 && <span>🟡 {stats.atencao}</span>}
          {(stats.emRisco > 0 || stats.atrasados > 0) && (
            <span>🔴 {stats.emRisco + stats.atrasados}</span>
          )}
          {stats.concluidos > 0 && <span>✅ {stats.concluidos}</span>}
          {item.dataFim && (
            <span className="ml-auto inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {fmtDate(item.dataFim)}
            </span>
          )}
        </p>

        {indicadores.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
            {indicadores.map((ind) => {
              const saude = indicadorSaude(ind);
              return (
                <li key={ind.id}>
                  <button
                    type="button"
                    onClick={() => onOpenChild(ind)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/50"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${INDICADOR_SAUDE_DOT[saude]}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {ind.titulo}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatIndicadorValor(ind.tipo, ind.valorAtual, ind.unidade)}
                      {ind.niveis.esperado != null &&
                        ind.tipo !== "binario" &&
                        ind.tipo !== "marco" &&
                        ` / ${formatIndicadorValor(ind.tipo, ind.niveis.esperado, ind.unidade)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Card de um Indicador (standalone ou dentro de um objetivo, quando
 * aberto sozinho pra edição rápida) — valor grande + barra + ação
 * principal contextual ao tipo de medição. */
function IndicadorCard({
  item,
  members,
  onEdit,
  onDelete,
  onQuickUpdate,
  onToggleBinario,
}: {
  item: Indicador;
  members: Member[];
  onEdit: () => void;
  onDelete: () => void;
  onQuickUpdate: () => void;
  onToggleBinario: () => void;
}) {
  const saude = indicadorSaude(item);
  const progresso = indicadorProgressoExibicao(item);
  const donoMember = members.find((m) => m.name === item.dono);

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex-1 p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar name={item.dono} photo={donoMember?.photo} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {item.dono || "Sem dono"}
                {(item.colaboradores?.length ?? 0) > 0 && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    +{item.colaboradores!.length}
                  </span>
                )}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {item.area} · Indicador{item.objetivoId ? "" : " independente"}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${INDICADOR_SAUDE_TONE[saude]}`}
          >
            {INDICADOR_SAUDE_LABEL[saude]}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Editar indicador"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Excluir indicador"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <h3 className="mt-5 text-2xl font-light tracking-tighter text-foreground">{item.titulo}</h3>
        {item.descricao && <p className="mt-1.5 text-sm text-muted-foreground">{item.descricao}</p>}

        <div className="mt-6">
          {item.tipo === "binario" ? (
            <p className="text-2xl font-light tracking-tighter text-foreground">
              {item.concluido ? "Concluído" : "Em aberto"}
            </p>
          ) : item.tipo === "marco" ? (
            <p className="text-2xl font-light tracking-tighter text-foreground">
              {item.marcoStatus === "concluido"
                ? "Concluído"
                : item.marcoStatus === "em_andamento"
                  ? "Em andamento"
                  : "Não iniciado"}
            </p>
          ) : (
            <p>
              <span className="text-5xl font-light tracking-tight text-foreground">
                {formatIndicadorValor(item.tipo, item.valorAtual, item.unidade)}
              </span>
              {item.niveis.esperado != null && (
                <span className="text-base font-medium text-muted-foreground">
                  {" "}
                  / {formatIndicadorValor(item.tipo, item.niveis.esperado, item.unidade)}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${INDICADOR_SAUDE_BAR[saude]}`}
            style={{ width: `${progresso}%` }}
          />
        </div>
        {item.dataFim && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" /> {fmtDate(item.dataFim)}
          </p>
        )}
      </div>

      <div className="flex px-6 pb-6 sm:px-7 sm:pb-7">
        {item.tipo === "binario" ? (
          <button
            type="button"
            onClick={onToggleBinario}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-6 py-2.5 text-center text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
          >
            <Check className="h-3.5 w-3.5" />
            {item.concluido ? "Reabrir indicador" : "Marcar concluído"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onQuickUpdate}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-foreground bg-foreground px-6 py-2.5 text-center text-sm font-medium text-background transition-colors duration-200 hover:bg-transparent hover:text-foreground"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Atualizar
          </button>
        )}
      </div>

      <IndicadorHistorico atualizacoes={item.atualizacoes ?? []} />
    </div>
  );
}

export function MetaCard(props: {
  item: MetaItem;
  indicadoresDoObjetivo: Indicador[];
  members: Member[];
  onEdit: (item: MetaItem) => void;
  onDelete: (item: MetaItem) => void;
  onQuickUpdate: (ind: Indicador) => void;
  onToggleBinario: (ind: Indicador) => void;
  onOpenChild: (ind: Indicador) => void;
}) {
  const { item } = props;
  if (item.kind === "objetivo") {
    return (
      <ObjetivoCard
        item={item}
        indicadores={props.indicadoresDoObjetivo}
        members={props.members}
        onEdit={() => props.onEdit(item)}
        onDelete={() => props.onDelete(item)}
        onOpenChild={props.onOpenChild}
      />
    );
  }
  return (
    <IndicadorCard
      item={item}
      members={props.members}
      onEdit={() => props.onEdit(item)}
      onDelete={() => props.onDelete(item)}
      onQuickUpdate={() => props.onQuickUpdate(item)}
      onToggleBinario={() => props.onToggleBinario(item)}
    />
  );
}
