import { useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CircleDot, Copy, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OPEN_STATUSES } from "@/lib/score";
import type { ScorePeriodMode } from "@/lib/performance-engine";
import { formatResponseDuration } from "@/lib/member-response-time";
import { useTeamTimeEntries } from "@/lib/time-entries";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { getStatus } from "@/components/team/member-ui";
import { MemberDialog, type Member } from "@/components/TimeSection";
import { useOpenMemberDeepLink, useTimeData } from "@/components/team/use-time-data";
import { AttentionTasks, type AttentionTab } from "@/components/team/AttentionTasks";
import { TeamDeliveriesWeek } from "@/components/team/TeamDeliveriesWeek";
import { TeamInsights } from "@/components/team/TeamInsights";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { MemberProfileV2 } from "./MemberProfileV2";
import { TimeMembersTable } from "./TimeMembersTable";
import {
  FilterChips,
  FilterGroup,
  FilterPill,
  FilterPopover,
  FilterRow,
  FilterSearch,
  FilterToolbar,
  SortMenu,
} from "@/components/shared/FilterToolbar";
import { TimeSummaryStrip } from "./TimeSummaryStrip";
import { dependencyBreakdownText, dependencySummary, teamAverageOpen } from "./member-metrics";
import {
  buildMemberRows,
  DEFAULT_SORT_DIR,
  matchesFilters,
  MEMBER_SORT_LABEL,
  sortMemberRows,
  type MemberFilter,
  type MemberSort,
  type MemberSortKey,
} from "./member-rows";
import { useTeamResponseTime } from "./use-response-time";
import { totalSecondsByUser } from "./time-v2-utils";

const PERIOD_OPTIONS: { value: ScorePeriodMode; label: string }[] = [
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "30dias", label: "30 dias" },
  { value: "trimestre", label: "Trimestre" },
];

const PERIOD_GROUP_LABEL: Record<ScorePeriodMode, string> = {
  semana: "Nesta semana",
  mes: "Neste mês",
  "30dias": "Últimos 30 dias",
  trimestre: "Últimos 3 meses",
};

const FILTERS: { key: MemberFilter; label: string; icon: ReactNode }[] = [
  { key: "atencao", label: "Atenção", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { key: "bloqueio", label: "Com bloqueio", icon: <Link2 className="h-3.5 w-3.5" /> },
  { key: "online", label: "Online", icon: <CircleDot className="h-3.5 w-3.5" /> },
];

/**
 * Aba Time — painel operacional + um perfil central por pessoa.
 * Cabeçalho → barra de controles (busca, período, filtros, ordenação) →
 * resumo (agora / no período) → lista central de membros (carga, prazo,
 * resposta, Score, horas — tudo no MESMO período) → tarefas que precisam
 * de atenção → entregas da semana → insights. Toda pessoa, em qualquer
 * bloco, abre o MESMO `MemberProfileV2`.
 */
export function TimeV2Page() {
  const d = useTimeData();
  const {
    members,
    loading,
    error,
    setError,
    load,
    isAdmin,
    meId,
    createdInfo,
    setCreatedInfo,
    onlineCount,
    scorePeriod,
    setScorePeriod,
    scoreRange,
    periodIndicatorsByMemberId,
    teamOnTime,
    performanceSettings,
    openTasksByMemberId,
    scoreByMemberId,
    tasksByMember,
    allTasksFlat,
    weekRange,
    weekdayData,
    weekdayTasksByDay,
    weeklyTrendPct,
    deliveryMemberRows,
    meetingsById,
    teamInsights,
    membersById,
    openTask,
    handleSave: saveMember,
    handleDelete,
    handleReset,
    confirmDialog,
  } = d;

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Set<MemberFilter>>(() => new Set());
  const [sort, setSort] = useState<MemberSort>({ key: "nome", dir: "asc" });
  const [viewing, setViewing] = useState<Member | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [attentionTab, setAttentionTab] = useState<AttentionTab>("atrasadas");
  const attentionRef = useRef<HTMLDivElement>(null);

  useOpenMemberDeepLink(members, setViewing);

  const viewer = useMemo(() => ({ isAdmin, meId }), [isAdmin, meId]);

  // Tudo da lista e do resumo "no período" usa o MESMO período (o do
  // Score): horas, conclusões, prazo, replanejamento e tempo de resposta.
  const { entries: periodEntries } = useTeamTimeEntries(scoreRange);
  const secondsByUser = useMemo(() => totalSecondsByUser(periodEntries), [periodEntries]);
  const teamResponse = useTeamResponseTime(scoreRange);

  const allRows = useMemo(
    () =>
      buildMemberRows(members, {
        viewer,
        tasksByMember,
        scoreByMemberId,
        secondsByUser,
        periodByMemberId: periodIndicatorsByMemberId,
        responseByMemberId: teamResponse.data?.byMemberId ?? null,
      }),
    [
      members,
      viewer,
      tasksByMember,
      scoreByMemberId,
      secondsByUser,
      periodIndicatorsByMemberId,
      teamResponse.data,
    ],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const isOnline = (id: string) => getStatus(id) === "online";
    const visible = allRows.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q)) &&
        matchesFilters(r, filters, isOnline),
    );
    return sortMemberRows(visible, sort);
  }, [allRows, query, filters, sort]);

  const filterCounts = useMemo(() => {
    const isOnline = (id: string) => getStatus(id) === "online";
    return Object.fromEntries(
      FILTERS.map((f) => [
        f.key,
        allRows.filter((r) => matchesFilters(r, new Set([f.key]), isOnline)).length,
      ]),
    ) as Record<MemberFilter, number>;
  }, [allRows]);

  const toggleFilter = (key: MemberFilter) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onSort = (key: MemberSortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DEFAULT_SORT_DIR[key] },
    );

  const openTasks = useMemo(
    () => allTasksFlat.filter((t) => OPEN_STATUSES.has(t.status)),
    [allTasksFlat],
  );
  const overdueCount = openTasks.filter((t) => t.bucket === "atrasada").length;
  const dueTodayCount = openTasks.filter((t) => t.bucket === "hoje").length;
  const deps = useMemo(() => dependencySummary(allTasksFlat), [allTasksFlat]);
  const completedInPeriod = useMemo(() => {
    const { from, to } = scoreRange;
    return allTasksFlat.filter((t) => {
      if (t.status !== "Concluído" || !t.completedAt) return false;
      const day = todayIsoInBrasilia(new Date(t.completedAt));
      return (!from || day >= from) && (!to || day <= to);
    }).length;
  }, [allTasksFlat, scoreRange]);
  const teamAvgOpen = useMemo(() => teamAverageOpen(allRows.map((r) => r.stats)), [allRows]);

  const responseLabel =
    teamResponse.state === "loading"
      ? "…"
      : formatResponseDuration(teamResponse.data?.teamAverageSeconds ?? null);
  const responseHint =
    teamResponse.state === "error"
      ? "Indisponível no momento"
      : teamResponse.state === "ready" && teamResponse.data?.teamAverageSeconds == null
        ? "Sem dados suficientes"
        : "Chat · métrica agregada";

  const weekRangeLabel = useMemo(() => {
    const parse = (iso: string) => {
      const [y, m, day] = iso.split("-").map(Number);
      return new Date(y, m - 1, day);
    };
    const fmt = (dt: Date) => dt.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    return `${fmt(parse(weekRange.from))} — ${fmt(parse(weekRange.to))}`;
  }, [weekRange]);

  const goAttention = (tab: AttentionTab) => {
    setAttentionTab(tab);
    attentionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSave = async (payload: Parameters<typeof saveMember>[0]) => {
    if (await saveMember(payload)) {
      setDialogOpen(false);
      setEditing(null);
    }
  };

  const openEdit = (m: Member | null) => {
    setViewing(null);
    setEditing(m);
    setDialogOpen(true);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <PageContainer variant="wide">
        <div className="space-y-6">
          <PageHeader
            title="Time"
            description="Visão geral da operação, produtividade, carga e indicadores do time."
            actionsSlot={
              <>
                {isAdmin && (
                  <Button variant="primary" size="comfortable" onClick={() => openEdit(null)}>
                    <Plus className="h-4 w-4" />
                    Novo membro
                  </Button>
                )}
              </>
            }
          />

          {/* Contexto global: o período vale para os KPIs e para a tabela de membros. */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
            <span className="text-sm text-text-secondary">Período</span>
            <SegmentedControl
              aria-label="Período"
              size="sm"
              value={scorePeriod}
              onChange={setScorePeriod}
              options={PERIOD_OPTIONS}
            />
          </div>

          {error && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              <span>{error}</span>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => void load()}
                  disabled={loading}
                  className="font-medium underline underline-offset-2 disabled:opacity-50"
                >
                  {loading ? "tentando..." : "tentar novamente"}
                </button>
                <button
                  onClick={() => setError(null)}
                  className="font-medium underline underline-offset-2"
                >
                  fechar
                </button>
              </div>
            </div>
          )}

          {createdInfo && (
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs">
              <div className="mb-1.5 font-medium text-foreground">
                Membro criado! Envie estas credenciais:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Email: <b className="font-semibold">{createdInfo.email}</b>
                </span>
                <span className="text-muted-foreground">·</span>
                <span>
                  Senha temporária: <b className="font-semibold">{createdInfo.tempPassword}</b>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `Email: ${createdInfo.email}\nSenha temporária: ${createdInfo.tempPassword}`,
                    )
                  }
                >
                  <Copy className="h-3 w-3" /> Copiar
                </Button>
                <button
                  onClick={() => setCreatedInfo(null)}
                  className="ml-auto font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  fechar
                </button>
              </div>
            </div>
          )}

          <TimeSummaryStrip
            openCount={openTasks.length}
            dueTodayCount={dueTodayCount}
            overdueCount={overdueCount}
            blockedCount={deps.total}
            blockedHint={deps.total > 0 ? dependencyBreakdownText(deps.byGroup) : null}
            completedCount={completedInPeriod}
            onTimePct={teamOnTime.pct}
            onTimeSample={teamOnTime.completed}
            responseLabel={responseLabel}
            responseHint={responseHint}
            periodLabel={PERIOD_GROUP_LABEL[scorePeriod]}
            onOpenAberto={() => goAttention("semana")}
            onOpenHoje={() => goAttention("hoje")}
            onOpenAtrasadas={() => goAttention("atrasadas")}
            onOpenBloqueadas={() => goAttention("bloqueadas")}
          />

          <FilterToolbar>
            <FilterRow>
              <FilterSearch value={query} onChange={setQuery} placeholder="Buscar membro..." />
              <FilterPopover
                title="Filtrar membros"
                activeCount={filters.size}
                onClear={() => setFilters(new Set())}
              >
                <FilterGroup label="Situação">
                  {FILTERS.map((f) => (
                    <FilterPill
                      key={f.key}
                      active={filters.has(f.key)}
                      onClick={() => toggleFilter(f.key)}
                    >
                      {f.label} · {filterCounts[f.key]}
                    </FilterPill>
                  ))}
                </FilterGroup>
              </FilterPopover>
              <SortMenu
                value={sort.key}
                options={MEMBER_SORT_LABEL}
                onChange={(key) => setSort({ key, dir: DEFAULT_SORT_DIR[key] })}
              />
            </FilterRow>
            <FilterChips
              chips={FILTERS.filter((f) => filters.has(f.key)).map((f) => ({
                id: f.key,
                label: f.label,
                onRemove: () => toggleFilter(f.key),
              }))}
              onClear={() => setFilters(new Set())}
            />
          </FilterToolbar>

          <div className="space-y-2">
            <p className="px-1 text-[11px] font-medium text-text-secondary">
              Membros · {members.length}
              {onlineCount > 0 && ` · ${onlineCount} online`}
            </p>
            <TimeMembersTable
              rows={rows}
              sort={sort}
              onSort={onSort}
              loading={loading}
              totalMembers={members.length}
              filtered={!!query.trim() || filters.size > 0}
              onOpenMember={setViewing}
            />
          </div>

          <div ref={attentionRef} className="scroll-mt-4">
            <AttentionTasks
              tasks={allTasksFlat}
              members={members}
              activeTab={attentionTab}
              onTabChange={setAttentionTab}
              onOpenTask={openTask}
            />
          </div>

          <TeamDeliveriesWeek
            weekRangeLabel={weekRangeLabel}
            weekdayData={weekdayData}
            tasksByDay={weekdayTasksByDay}
            memberRows={deliveryMemberRows}
            weeklyTrendPct={weeklyTrendPct}
            onOpenTask={openTask}
            onOpenMember={setViewing}
          />

          <TeamInsights
            insights={teamInsights}
            membersById={membersById}
            onOpenMember={setViewing}
          />

          <MemberDialog
            open={dialogOpen}
            initial={editing}
            isSelf={!!editing && editing.id === meId}
            onOpenChange={(v) => {
              setDialogOpen(v);
              if (!v) setEditing(null);
            }}
            onSave={handleSave}
          />

          <MemberProfileV2
            member={viewing}
            viewer={viewer}
            tasksForMember={viewing ? (tasksByMember.get(viewing.name) ?? []) : []}
            openTasksForMember={viewing ? (openTasksByMemberId.get(viewing.id) ?? []) : []}
            teamAvgOpen={teamAvgOpen}
            performanceSettings={performanceSettings}
            meetingsById={meetingsById}
            onOpenTask={(t) => {
              setViewing(null);
              openTask(t);
            }}
            onClose={() => setViewing(null)}
            onEdit={openEdit}
            onDelete={(id) => {
              setViewing(null);
              void handleDelete(id);
            }}
            onReset={(id) => void handleReset(id)}
          />
          {confirmDialog}
        </div>
      </PageContainer>
    </TooltipProvider>
  );
}
