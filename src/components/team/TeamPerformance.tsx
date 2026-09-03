import { useMemo } from "react";
import { Info, Gauge, UsersIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  ScoreOperacionalV2,
  ScorePeriodMode,
  PerformanceSettings,
} from "@/lib/performance-engine";
import type { Member } from "@/components/TimeSection";
import type { DashTask } from "@/lib/task-aggregation";
import { MemberPerformanceRow } from "./MemberPerformanceRow";
import { ScorePeriodSelector } from "./ScorePeriodSelector";

/** "Performance do Time" — o Score de cada pessoa (0-100, gestão), que
 * continua sendo a lista de membros da página (decisão confirmada com o
 * usuário: não existe uma lista de gestão separada). Mostra só o
 * essencial por linha (avatar, nome, cargo, atrasos, score) — o
 * detalhamento completo do Score (Execução/Regularidade/Compromissos,
 * composição) fica na ficha individual do membro: "a página Time
 * identifica, a ficha individual explica". */
export function TeamPerformance({
  members,
  scoreByMemberId,
  scorePeriod,
  onScorePeriodChange,
  performanceSettings,
  tasksByMember,
  onOpenTask,
  meId,
  isAdmin,
  loading,
  hasAnyMembers,
  onOpenProfile,
  onEdit,
  onDelete,
  onReset,
}: {
  members: Member[];
  scoreByMemberId: Map<string, ScoreOperacionalV2>;
  scorePeriod: ScorePeriodMode;
  onScorePeriodChange: (v: ScorePeriodMode) => void;
  performanceSettings: PerformanceSettings;
  tasksByMember: Map<string, DashTask[]>;
  onOpenTask: (t: DashTask) => void;
  meId: string | null;
  isAdmin: boolean;
  loading: boolean;
  hasAnyMembers: boolean;
  onOpenProfile: (m: Member, opts?: { showComposition?: boolean }) => void;
  onEdit: (m: Member) => void;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
}) {
  const ranked = useMemo(
    () =>
      [...members].sort(
        (a, b) =>
          (scoreByMemberId.get(b.id)?.score ?? -1) - (scoreByMemberId.get(a.id)?.score ?? -1),
      ),
    [members, scoreByMemberId],
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 px-1">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Gauge className="h-3.5 w-3.5 text-foreground/70" /> Performance do Time
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Score operacional e tarefas em atraso
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <ScorePeriodSelector value={scorePeriod} onChange={onScorePeriodChange} />
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Como o Score é calculado"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <p className="mb-2 text-xs font-semibold text-foreground">
                Score Operacional (0-100)
              </p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center justify-between gap-3">
                  <span>Entrega — conclusão no prazo, penaliza vencidas em aberto</span>
                  <span className="shrink-0 font-semibold text-foreground">50 pts</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span>Previsibilidade — quão em cima da hora os prazos mudam</span>
                  <span className="shrink-0 font-semibold text-foreground">35 pts</span>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <span>Compromissos — presença nas reuniões esperadas</span>
                  <span className="shrink-0 font-semibold text-foreground">15 pts</span>
                </li>
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Prazos encerram às 19h. Veja o detalhamento e a composição completa na ficha
                individual do membro.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[52px] animate-pulse rounded-xl border border-border bg-muted/30"
              />
            ))}
          </div>
        ) : ranked.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-10 text-center">
            <UsersIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              {hasAnyMembers ? "Nenhum resultado para essa busca." : "Nenhum membro ainda."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {ranked.map((m) => (
              <MemberPerformanceRow
                key={m.id}
                member={m}
                score={scoreByMemberId.get(m.id)}
                overdueTasks={(tasksByMember.get(m.name) ?? []).filter(
                  (t) => t.bucket === "atrasada",
                )}
                onOpenTask={onOpenTask}
                isSelf={m.id === meId}
                isAdmin={isAdmin}
                onOpenProfile={(opts) => onOpenProfile(m, opts)}
                onEdit={() => onEdit(m)}
                onDelete={() => onDelete(m.id)}
                onReset={() => onReset(m.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
