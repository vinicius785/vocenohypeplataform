import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { avatarAccent, getStatus, initialsOf, PresenceDot } from "@/components/team/member-ui";
import { STATUS_LABEL } from "@/lib/chat-store";
import { SCORE_CLASSIFICACAO_TONE, type ScoreOperacionalV2 } from "@/lib/performance-engine";
import type { DashTask } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";
import { canSeeField, formatHours, memberTaskStats, type MemberTaskStats } from "./time-v2-utils";

type SortKey = "nome" | "abertas" | "atrasadas" | "horas";

const GRID = "md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_72px_84px_84px_76px]";

type Row = {
  member: Member;
  name: string;
  role: string;
  stats: MemberTaskStats;
  score: ScoreOperacionalV2 | undefined;
  seconds: number;
};

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
  sortKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey?: SortKey;
  active?: boolean;
  dir?: "asc" | "desc";
  onSort?: (k: SortKey) => void;
  className?: string;
}) {
  if (!sortKey || !onSort) return <span className={className}>{label}</span>;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 hover:text-foreground ${className ?? ""}`}
    >
      {label}
      {active &&
        (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );
}

/**
 * Lista central do Time — a área principal da página: uma linha por
 * pessoa, leitura rápida, clique abre o perfil central. Ordenação só por
 * nome/abertas/atrasadas/horas (de propósito NÃO por Score: o Score é
 * ferramenta de gestão, nunca ranking entre membros).
 */
export function TimeMembersTable({
  members,
  viewer,
  tasksByMember,
  scoreByMemberId,
  secondsByUser,
  loading,
  totalMembers,
  onOpenMember,
}: {
  members: Member[];
  viewer: { isAdmin: boolean; meId: string | null };
  tasksByMember: Map<string, DashTask[]>;
  scoreByMemberId: Map<string, ScoreOperacionalV2>;
  secondsByUser: Map<string, number>;
  loading: boolean;
  totalMembers: number;
  onOpenMember: (m: Member) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "nome",
    dir: "asc",
  });

  const rows = useMemo<Row[]>(() => {
    const list = members.map((m) => ({
      member: m,
      name: canSeeField(m, "name", viewer) ? m.name || "(sem nome)" : "Membro",
      role: canSeeField(m, "role", viewer) ? m.role : "",
      stats: memberTaskStats(tasksByMember.get(m.name) ?? []),
      score: scoreByMemberId.get(m.id),
      seconds: secondsByUser.get(m.id) ?? 0,
    }));
    const mult = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      switch (sort.key) {
        case "abertas":
          return (a.stats.abertas - b.stats.abertas) * mult;
        case "atrasadas":
          return (a.stats.atrasadas - b.stats.atrasadas) * mult;
        case "horas":
          return (a.seconds - b.seconds) * mult;
        default:
          return a.name.localeCompare(b.name, "pt-BR") * mult;
      }
    });
  }, [members, viewer, tasksByMember, scoreByMemberId, secondsByUser, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "nome" ? "asc" : "desc" },
    );

  return (
    <section className="overflow-hidden rounded-[22px] bg-card dark:shadow-none">
      <div
        className={`hidden items-center gap-3 border-b border-border px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-text-secondary md:grid ${GRID}`}
      >
        <HeaderCell
          label="Pessoa"
          sortKey="nome"
          active={sort.key === "nome"}
          dir={sort.dir}
          onSort={onSort}
        />
        <HeaderCell label="Status" />
        <HeaderCell
          label="Abertas"
          sortKey="abertas"
          active={sort.key === "abertas"}
          dir={sort.dir}
          onSort={onSort}
          className="justify-end"
        />
        <HeaderCell
          label="Atrasadas"
          sortKey="atrasadas"
          active={sort.key === "atrasadas"}
          dir={sort.dir}
          onSort={onSort}
          className="justify-end"
        />
        <HeaderCell label="Score" className="justify-end text-right" />
        <HeaderCell
          label="Horas (sem.)"
          sortKey="horas"
          active={sort.key === "horas"}
          dir={sort.dir}
          onSort={onSort}
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
            : "Nenhum membro encontrado para essa busca."}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((r) => {
            const status = getStatus(r.member.id);
            return (
              <li key={r.member.id}>
                <button
                  type="button"
                  onClick={() => onOpenMember(r.member)}
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
                      <Truncated text={r.role || "—"} className="text-xs text-text-secondary" />
                    </div>
                  </div>

                  <span className="hidden truncate text-xs text-text-secondary md:block">
                    {STATUS_LABEL[status]}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-foreground md:block">
                    {r.stats.abertas || "—"}
                  </span>
                  <span
                    className={`hidden text-right text-sm tabular-nums md:block ${r.stats.atrasadas > 0 ? "font-semibold text-destructive" : "text-text-secondary"}`}
                  >
                    {r.stats.atrasadas}
                  </span>
                  <span className="hidden text-right text-sm md:block">
                    <ScoreCell score={r.score} />
                  </span>
                  <span className="hidden text-right text-sm tabular-nums text-text-secondary md:block">
                    {formatHours(r.seconds)}
                  </span>

                  <p className="truncate pl-12 text-[11px] text-text-secondary md:hidden">
                    {STATUS_LABEL[status]} · {r.stats.abertas} abertas ·{" "}
                    <span className={r.stats.atrasadas > 0 ? "font-semibold text-destructive" : ""}>
                      {r.stats.atrasadas} atrasadas
                    </span>{" "}
                    · Score <ScoreCell score={r.score} />
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
