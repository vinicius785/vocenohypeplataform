import { useMemo, useRef } from "react";
import { OPEN_STATUSES, type WeekBucket } from "@/lib/score";
import type { DashTask, DashTaskFlat } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";
import type {
  ScoreOperacionalResult,
  ScorePeriodMode,
  PerformanceEventLike,
} from "@/lib/performance-engine";
import { TeamMetricCard } from "./TeamMetricCard";
import { AttentionTasks, type AttentionTab } from "./AttentionTasks";
import { TeamWorkload } from "./TeamWorkload";
import { TasksByStatus } from "./TasksByStatus";
import { WeeklyDeliveries } from "./WeeklyDeliveries";
import { TeamPerformance } from "./TeamPerformance";
import { TeamXpRanking } from "./TeamXpRanking";
import { TeamIndicators } from "./TeamIndicators";
import { TeamAdminSection } from "./TeamAdminSection";

/**
 * Dashboard de gestão do time — substitui a antiga listagem simples de
 * membros. `DiretorioTab` (TimeSection.tsx) continua sendo a camada de
 * dados (todo o fetch/estado/sincronização); este componente só monta a
 * grade visual em cima do que já foi computado lá, delegando cada bloco
 * a um componente próprio (métrica, atenção, carga, status, entregas,
 * performance, administração).
 */
export function TeamDashboard({
  allMembers,
  filteredMembers,
  scoreByMemberId,
  scorePeriod,
  onScorePeriodChange,
  performanceEvents,
  allTasksFlat,
  tasksByMember,
  weeklyData,
  onlineCount,
  meId,
  isAdmin,
  loading,
  attentionTab,
  onAttentionTabChange,
  onOpenTask,
  onOpenMember,
  onEditMember,
  onDeleteMember,
  onResetMember,
}: {
  /** Todos os membros (sem filtro de busca) — usado pelos gráficos
   * (carga do time, entregas) que precisam refletir o time inteiro. */
  allMembers: Member[];
  /** Membros após a busca do header — só a Performance Operacional é
   * filtrada por busca; os gráficos usam `allMembers`. */
  filteredMembers: Member[];
  scoreByMemberId: Map<string, ScoreOperacionalResult>;
  scorePeriod: ScorePeriodMode;
  onScorePeriodChange: (v: ScorePeriodMode) => void;
  /** Eventos do ledger já filtrados ao `scorePeriod` — alimenta os
   * Indicadores operacionais agregados (o Ranking do mês busca os seus
   * próprios eventos por mês, à parte). */
  performanceEvents: PerformanceEventLike[];
  allTasksFlat: DashTaskFlat[];
  tasksByMember: Map<string, DashTask[]>;
  weeklyData: WeekBucket[];
  onlineCount: number;
  meId: string | null;
  isAdmin: boolean;
  loading: boolean;
  attentionTab: AttentionTab;
  onAttentionTabChange: (tab: AttentionTab) => void;
  onOpenTask: (t: DashTask) => void;
  onOpenMember: (m: Member) => void;
  onEditMember: (m: Member) => void;
  onDeleteMember: (id: string) => void;
  onResetMember: (id: string) => void;
}) {
  const attentionRef = useRef<HTMLDivElement>(null);
  const scrollToAttention = (tab: AttentionTab) => {
    onAttentionTabChange(tab);
    attentionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openTasks = useMemo(
    () => allTasksFlat.filter((t) => OPEN_STATUSES.has(t.status)),
    [allTasksFlat],
  );
  const overdueCount = useMemo(
    () => openTasks.filter((t) => t.bucket === "atrasada").length,
    [openTasks],
  );
  const dueTodayCount = useMemo(
    () => openTasks.filter((t) => t.bucket === "hoje").length,
    [openTasks],
  );

  const thisWeek = weeklyData[weeklyData.length - 1];
  const lastWeek = weeklyData[weeklyData.length - 2];
  const weeklyVariation = useMemo(() => {
    if (!thisWeek || !lastWeek) return null;
    if (lastWeek.count === 0) return thisWeek.count > 0 ? "+" + thisWeek.count : null;
    const pct = Math.round(((thisWeek.count - lastWeek.count) / lastWeek.count) * 100);
    return `${pct > 0 ? "+" : ""}${pct}% vs. semana passada`;
  }, [thisWeek, lastWeek]);

  // "Carga do time" — sem conceito real de capacidade no sistema (só o
  // que existe: quantas tarefas abertas cada um tem), então o card
  // mostra a média real de tarefas abertas por pessoa + quantos estão
  // acima dessa média, em vez de inventar uma % de "capacidade".
  const workload = useMemo(() => {
    const withTaskCounts = allMembers.map(
      (m) => (tasksByMember.get(m.name) ?? []).filter((t) => OPEN_STATUSES.has(t.status)).length,
    );
    const totalOpen = withTaskCounts.reduce((s, n) => s + n, 0);
    const avg = allMembers.length > 0 ? totalOpen / allMembers.length : 0;
    const acimaDaMedia = withTaskCounts.filter((n) => n > avg && avg > 0).length;
    return { avg, acimaDaMedia };
  }, [allMembers, tasksByMember]);

  return (
    <div className="space-y-4">
      {/* Linha 1 — 5 cards de indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <TeamMetricCard
          label="Membros"
          value={allMembers.length}
          sublabel={`${onlineCount} online agora`}
        />
        <TeamMetricCard
          label="Tarefas em aberto"
          value={openTasks.length}
          sublabel={`${dueTodayCount} vencem hoje`}
          onClick={() => scrollToAttention("semana")}
        />
        <TeamMetricCard
          label="Atrasadas"
          value={overdueCount}
          tone={overdueCount > 0 ? "danger" : "neutral"}
          onClick={() => scrollToAttention("atrasadas")}
        />
        <TeamMetricCard
          label="Concluídas na semana"
          value={thisWeek?.count ?? 0}
          sublabel={weeklyVariation}
        />
        <TeamMetricCard
          label="Carga do time"
          value={`${workload.avg.toFixed(1)} tarefas/pessoa`}
          sublabel={
            workload.acimaDaMedia > 0
              ? `${workload.acimaDaMedia} membro${workload.acimaDaMedia === 1 ? "" : "s"} acima da média do time`
              : "Carga equilibrada entre o time"
          }
        />
      </div>

      {/* Linha 2 — Tarefas que precisam de atenção (60%) + Carga por membro (40%) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div ref={attentionRef} className="lg:col-span-7">
          <AttentionTasks
            tasks={allTasksFlat}
            members={allMembers}
            activeTab={attentionTab}
            onTabChange={onAttentionTabChange}
            onOpenTask={onOpenTask}
          />
        </div>
        <div className="lg:col-span-5">
          <TeamWorkload
            members={allMembers}
            tasksByMember={tasksByMember}
            onOpenMember={onOpenMember}
          />
        </div>
      </div>

      {/* Linha 3 — Entregas por semana (60%) + Tarefas por status (40%) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <WeeklyDeliveries data={weeklyData} />
        </div>
        <div className="lg:col-span-5">
          <TasksByStatus tasks={allTasksFlat} onOpenTask={onOpenTask} />
        </div>
      </div>

      {/* Linha 4 — Performance Operacional (100%) — Score de gestão, NUNCA chamado de "ranking" */}
      <TeamPerformance
        members={filteredMembers}
        scoreByMemberId={scoreByMemberId}
        scorePeriod={scorePeriod}
        onScorePeriodChange={onScorePeriodChange}
        meId={meId}
        isAdmin={isAdmin}
        loading={loading}
        hasAnyMembers={allMembers.length > 0}
        onOpenProfile={onOpenMember}
        onEdit={onEditMember}
        onDelete={onDeleteMember}
        onReset={onResetMember}
      />

      {/* Linha 4.5 — Ranking do mês (XP, gamificação) + Indicadores operacionais (só admin) */}
      {isAdmin ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <TeamXpRanking members={allMembers} />
          </div>
          <div className="lg:col-span-5">
            <TeamIndicators
              events={performanceEvents}
              currentlyOverdueCount={overdueCount}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      ) : (
        <TeamXpRanking members={allMembers} />
      )}

      {/* Linha 5 — Administração (100%) */}
      <TeamAdminSection isAdmin={isAdmin} />
    </div>
  );
}
