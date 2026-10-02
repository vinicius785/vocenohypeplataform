import { useMemo, useRef, useState } from "react";
import { Plus, Search, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OPEN_STATUSES } from "@/lib/score";
import { useTeamTimeEntries } from "@/lib/time-entries";
import { MemberDialog, type Member } from "@/components/TimeSection";
import { useOpenMemberDeepLink, useTimeData } from "@/components/team/use-time-data";
import { AttentionTasks, type AttentionTab } from "@/components/team/AttentionTasks";
import { TeamWorkload } from "@/components/team/TeamWorkload";
import { TeamDeliveriesWeek } from "@/components/team/TeamDeliveriesWeek";
import { TeamInsights } from "@/components/team/TeamInsights";
import { PageContainer } from "@/components/shared/PageContainer";
import { MemberProfileV2 } from "./MemberProfileV2";
import { TimeMembersTable } from "./TimeMembersTable";
import { TimeSummaryStrip } from "./TimeSummaryStrip";
import { totalSecondsByUser } from "./time-v2-utils";

/**
 * Aba Time V2 — "visão da operação + um perfil central por pessoa".
 * Mesma camada de dados da V1 (`useTimeData`), arquitetura nova: resumo
 * operacional → lista central de membros (principal) → blocos secundários
 * (atenção, carga, entregas, insights). Toda pessoa, em qualquer bloco,
 * abre o MESMO `MemberProfileV2`; não existe mais perfil/modal próprio de
 * Score, Jornada, Carga ou Insights.
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
    performanceSettings,
    openTasksByMemberId,
    scoreByMemberId,
    tasksByMember,
    allTasksFlat,
    weeklyData,
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
  const [viewing, setViewing] = useState<Member | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [attentionTab, setAttentionTab] = useState<AttentionTab>("atrasadas");
  const attentionRef = useRef<HTMLDivElement>(null);

  useOpenMemberDeepLink(members, setViewing);

  const viewer = useMemo(() => ({ isAdmin, meId }), [isAdmin, meId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q),
    );
  }, [members, query]);

  // Horas da semana de todo o time numa única consulta (RLS: o próprio ou
  // quem tem a permissão `time`).
  const { entries: weekEntries } = useTeamTimeEntries(weekRange);
  const secondsByUser = useMemo(() => totalSecondsByUser(weekEntries), [weekEntries]);

  const openTasks = useMemo(
    () => allTasksFlat.filter((t) => OPEN_STATUSES.has(t.status)),
    [allTasksFlat],
  );
  const overdueCount = openTasks.filter((t) => t.bucket === "atrasada").length;
  const dueTodayCount = openTasks.filter((t) => t.bucket === "hoje").length;
  const completedThisWeek = weeklyData[weeklyData.length - 1]?.count ?? 0;

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
        <div className="-m-4 min-h-[calc(100vh-4rem)] space-y-6 bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[36px] font-bold leading-[1.05] tracking-tight text-foreground md:text-[42px]">
                Time
              </p>
              <p className="mt-1.5 text-sm text-text-secondary">
                Visão geral da operação, produtividade e carga do time.
              </p>
            </div>
            {isAdmin && (
              <Button variant="primary" size="comfortable" onClick={() => openEdit(null)}>
                <Plus className="h-4 w-4" />
                Novo membro
              </Button>
            )}
          </div>

          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar membro..."
              aria-label="Buscar membro"
              className="h-10 border-0 bg-card pl-9 text-sm"
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
            membersCount={members.length}
            onlineCount={onlineCount}
            completedThisWeek={completedThisWeek}
            onOpenAberto={() => goAttention("semana")}
            onOpenHoje={() => goAttention("hoje")}
            onOpenAtrasadas={() => goAttention("atrasadas")}
          />

          <TimeMembersTable
            members={filtered}
            viewer={viewer}
            tasksByMember={tasksByMember}
            scoreByMemberId={scoreByMemberId}
            secondsByUser={secondsByUser}
            loading={loading}
            totalMembers={members.length}
            onOpenMember={setViewing}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div ref={attentionRef} className="min-w-0 lg:col-span-7">
              <AttentionTasks
                tasks={allTasksFlat}
                members={members}
                activeTab={attentionTab}
                onTabChange={setAttentionTab}
                onOpenTask={openTask}
              />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <TeamWorkload
                members={members}
                tasksByMember={tasksByMember}
                onOpenMember={setViewing}
              />
            </div>
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
