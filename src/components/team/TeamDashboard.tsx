import { useMemo, useRef } from "react";
import {
  OPEN_STATUSES,
  type WeekBucket,
  type WeekdayBucket,
  type WeekdayPeriodMode,
} from "@/lib/score";
import type { DashTask, DashTaskFlat } from "@/lib/task-aggregation";
import type { Member } from "@/components/TimeSection";
import type {
  ScoreOperacionalV2,
  ScorePeriodMode,
  PerformanceEventLike,
  PerformanceSettings,
} from "@/lib/performance-engine";
import { TeamMetricCard } from "./TeamMetricCard";
import { AttentionTasks, type AttentionTab } from "./AttentionTasks";
import { TeamWorkload } from "./TeamWorkload";
import { TeamWeekdayProductivity } from "./TeamWeekdayProductivity";
import { TeamPerformance } from "./TeamPerformance";
import { TeamIndicators } from "./TeamIndicators";

/**
 * Cockpit operacional do time — identifica rapidamente situação, carga,
 * produtividade e performance; a explicação detalhada de cada pessoa
 * vive na ficha individual (`MemberProfileDialog`), aberta a partir de
 * qualquer linha aqui. `DiretorioTab` (TimeSection.tsx) continua sendo a
 * camada de dados; este componente só monta a grade visual em cima do
 * que já foi computado lá, delegando cada bloco a um componente próprio
 * (métrica, atenção, carga, produtividade por dia da semana,
 * performance, indicadores). Administração (senhas/bugs/config do
 * Score) vive em Configurações, não aqui.
 */
export function TeamDashboard({
  allMembers,
  filteredMembers,
  scoreByMemberId,
  scorePeriod,
  onScorePeriodChange,
  performanceEvents,
  performanceSettings,
  allTasksFlat,
  tasksByMember,
  weeklyData,
  weekdayData,
  weekdayPeriod,
  onWeekdayPeriodChange,
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
  /** Membros após a busca do header — só a Performance do Time é
   * filtrada por busca; os gráficos usam `allMembers`. */
  filteredMembers: Member[];
  scoreByMemberId: Map<string, ScoreOperacionalV2>;
  scorePeriod: ScorePeriodMode;
  onScorePeriodChange: (v: ScorePeriodMode) => void;
  /** Eventos do ledger já filtrados ao `scorePeriod` — alimenta os
   * Indicadores Operacionais agregados. */
  performanceEvents: PerformanceEventLike[];
  performanceSettings: PerformanceSettings;
  allTasksFlat: DashTaskFlat[];
  tasksByMember: Map<string, DashTask[]>;
  weeklyData: WeekBucket[];
  weekdayData: WeekdayBucket[];
  weekdayPeriod: WeekdayPeriodMode;
  onWeekdayPeriodChange: (v: WeekdayPeriodMode) => void;
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

  return (
    <div className="space-y-4">
      {/* Linha 1 — 4 cards de indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      {/* Linha 3 — Produtividade por dia da semana (100%) */}
      <TeamWeekdayProductivity
        data={weekdayData}
        period={weekdayPeriod}
        onPeriodChange={onWeekdayPeriodChange}
      />

      {/* Linha 4 — Performance do Time (100%) — Score de gestão, NUNCA chamado de "ranking" */}
      <TeamPerformance
        members={filteredMembers}
        scoreByMemberId={scoreByMemberId}
        scorePeriod={scorePeriod}
        onScorePeriodChange={onScorePeriodChange}
        performanceSettings={performanceSettings}
        meId={meId}
        isAdmin={isAdmin}
        loading={loading}
        hasAnyMembers={allMembers.length > 0}
        onOpenProfile={onOpenMember}
        onEdit={onEditMember}
        onDelete={onDeleteMember}
        onReset={onResetMember}
      />

      {/* Linha 5 — Indicadores Operacionais (100%) — sempre visível, mesmo período de Performance do Time acima */}
      <TeamIndicators events={performanceEvents} currentlyOverdueCount={overdueCount} />
    </div>
  );
}
