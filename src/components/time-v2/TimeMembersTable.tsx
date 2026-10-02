import { ArrowDown, ArrowUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { avatarAccent, getStatus, initialsOf, PresenceDot } from "@/components/team/member-ui";
import { STATUS_LABEL } from "@/lib/chat-store";
import { SCORE_CLASSIFICACAO_TONE, type ScoreOperacionalV2 } from "@/lib/performance-engine";
import { formatResponseDuration } from "@/lib/member-response-time";
import { LoadBadge } from "./LoadBadge";
import type { MemberRow, MemberSort, MemberSortKey } from "./member-rows";
import { formatHours } from "./time-v2-utils";

/** Colunas progressivas: em telas médias só o essencial (pessoa, carga,
 * abertas, atrasadas, Score); a partir de `xl` entram prazo, resposta,
 * replanejamento e horas. Células `hidden` não ocupam trilha do grid. */
const GRID =
  "md:grid-cols-[minmax(0,2fr)_84px_64px_72px_64px] xl:grid-cols-[minmax(0,2.2fr)_84px_64px_72px_72px_80px_60px_64px_72px]";

/** Texto longo SEMPRE trunca com ellipsis e expõe o valor completo por
 * tooltip — nunca por redução de fonte. */
function Truncated({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <span className={`block min-w-0 truncate ${className ?? ""}`}>{text}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{text}</TooltipContent>
    </Tooltip>
  );
}

function ScoreCell({ score }: { score: ScoreOperacionalV2 | undefined }) {
  if (!score || score.score == null || score.dataState === "sem_dados") {
    return <span className="text-text-secondary">—</span>;
  }
  const tone =
    score.dataState === "definitivo"
      ? (SCORE_CLASSIFICACAO_TONE[score.classificacao ?? "Sem avaliação"] ?? "text-foreground")
      : "text-text-secondary";
  return (
    <span className={`font-semibold tabular-nums ${tone}`}>
      {score.score}
      {score.dataState === "provisorio" && (
        <span className="ml-1 text-[10px] font-normal">prov.</span>
      )}
    </span>
  );
}

function HeaderCell({
  label,
  title,
  sortKey,
  sort,
  onSort,
  className,
  xlOnly,
}: {
  label: string;
  title?: string;
  sortKey?: MemberSortKey;
  sort?: MemberSort;
  onSort?: (k: MemberSortKey) => void;
  className?: string;
  /** Coluna que só aparece a partir de `xl` (mesmo critério das células). */
  xlOnly?: boolean;
}) {
  const display = xlOnly ? "hidden xl:inline-flex" : "inline-flex";
  if (!sortKey || !onSort) {
    return (
      <span className={className} title={title}>
        {label}
      </span>
    );
  }
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={title}
      aria-label={`Ordenar por ${title ?? label}`}
      className={`${display} items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""} ${className ?? ""}`}
    >
      {label}
      {active &&
        (sort?.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

/**
 * Lista central do Time — a área principal da página: uma linha por
 * pessoa, leitura rápida, clique abre o perfil central. Ordenação é
 * escolha de quem olha (padrão: nome); nada aqui vira ranking automático.
 */
export function TimeMembersTable({
  rows,
  sort,
  onSort,
  loading,
  totalMembers,
  filtered,
  onOpenMember,
}: {
  rows: MemberRow[];
  sort: MemberSort;
  onSort: (k: MemberSortKey) => void;
  loading: boolean;
  totalMembers: number;
  /** Há busca/filtro ativo (muda a mensagem de vazio). */
  filtered: boolean;
  onOpenMember: (m: MemberRow["member"]) => void;
}) {
  const hp = { sort, onSort };
  return (
    <section className="overflow-hidden rounded-[22px] bg-card dark:shadow-none">
      <div
        className={`hidden items-center gap-3 border-b border-border px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-text-secondary md:grid ${GRID}`}
      >
        <HeaderCell label="Pessoa" sortKey="nome" {...hp} />
        <HeaderCell label="Carga" title="Carga atual — passe o mouse no selo para ver o motivo" />
        <HeaderCell label="Abertas" sortKey="abertas" {...hp} className="justify-end" />
        <HeaderCell label="Atrasadas" sortKey="atrasadas" {...hp} className="justify-end" />
        <HeaderCell
          label="No prazo"
          title="Conclusão no prazo"
          sortKey="noPrazo"
          {...hp}
          xlOnly
          className="justify-end"
        />
        <HeaderCell
          label="Resposta"
          title="Tempo médio de resposta"
          sortKey="resposta"
          {...hp}
          xlOnly
          className="justify-end"
        />
        <HeaderCell
          label="Replan."
          title="Replanejamentos"
          sortKey="replanejamentos"
          {...hp}
          xlOnly
          className="justify-end"
        />
        <HeaderCell label="Score" sortKey="score" {...hp} className="justify-end" />
        <HeaderCell
          label="Horas"
          title="Horas trabalhadas"
          sortKey="horas"
          {...hp}
          xlOnly
          className="justify-end"
        />
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-px">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="hidden h-3.5 w-48 md:block" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-text-secondary">
          {totalMembers === 0
            ? "Nenhum membro cadastrado."
            : filtered
              ? "Nenhum membro encontrado com esses filtros."
              : "Nenhum membro encontrado."}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((r) => {
            const status = getStatus(r.member.id);
            return (
              <li key={r.member.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenMember(r.member)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenMember(r.member);
                    }
                  }}
                  aria-label={`Abrir perfil de ${r.name}`}
                  className={`grid w-full min-w-0 cursor-pointer grid-cols-1 items-center gap-x-3 gap-y-1 px-5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${GRID}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar className="h-9 w-9">
                        {r.member.photo && (
                          <AvatarImage src={r.member.photo} alt="" className="object-cover" />
                        )}
                        <AvatarFallback
                          className={`text-sm font-semibold ${avatarAccent(r.member.id)}`}
                        >
                          {initialsOf(r.name === "Membro" ? "" : r.name, r.member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <PresenceDot status={status} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Truncated text={r.name} className="text-sm font-semibold text-foreground" />
                      <Truncated
                        text={r.role ? `${r.role} · ${STATUS_LABEL[status]}` : STATUS_LABEL[status]}
                        className="text-xs text-text-secondary"
                      />
                    </div>
                  </div>

                  <span className="hidden md:block">
                    <LoadBadge load={r.load} />
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-foreground md:block">
                    {r.stats.abertas || "—"}
                  </span>
                  <span
                    className={`hidden text-right text-sm tabular-nums md:block ${r.stats.atrasadas > 0 ? "font-semibold text-destructive" : "text-text-secondary"}`}
                  >
                    {r.stats.atrasadas}
                  </span>
                  <span
                    className="hidden text-right text-sm tabular-nums text-text-secondary xl:block"
                    title={r.completed > 0 ? `${r.completed} conclusões no período` : undefined}
                  >
                    {pct(r.onTimePct)}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-text-secondary xl:block">
                    {formatResponseDuration(r.responseSeconds)}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-text-secondary xl:block">
                    {r.replans}
                  </span>
                  <span className="hidden text-right text-sm md:block">
                    <ScoreCell score={r.score} />
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-text-secondary xl:block">
                    {formatHours(r.seconds)}
                  </span>

                  <div className="flex min-w-0 items-center gap-2 pl-12 md:hidden">
                    <LoadBadge load={r.load} />
                    <p className="min-w-0 truncate text-[11px] text-text-secondary">
                      {r.stats.abertas} abertas ·{" "}
                      <span
                        className={r.stats.atrasadas > 0 ? "font-semibold text-destructive" : ""}
                      >
                        {r.stats.atrasadas} atrasadas
                      </span>{" "}
                      · Score <ScoreCell score={r.score} />
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
