import { useMemo, useState } from "react";
import { MoreHorizontal, Pencil, ShieldCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { avatarAccent, getStatus, initialsOf, PresenceDot } from "@/components/team/member-ui";
import { ScoreOperacionalPanel } from "@/components/team/ScoreOperacionalPanel";
import { useMemberPerformance } from "@/components/team/use-member-performance";
import type { Member } from "@/components/TimeSection";
import type { DashTask } from "@/lib/task-aggregation";
import type { PerformanceOpenTask } from "@/lib/score";
import type { PerformanceSettings } from "@/lib/performance-engine";
import type { Meeting } from "@/lib/reunioes-store";
import { STATUS_LABEL } from "@/lib/chat-store";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { useTeamTimeEntries } from "@/lib/time-entries";
import { ProfileCommunication } from "./ProfileCommunication";
import {
  ProfileHistory,
  ProfileJourney,
  ProfileOverview,
  ProfilePerformance,
  ProfileTasks,
} from "./profile-sections";
import {
  canSeeField,
  entrySeconds,
  memberTaskStats,
  PROFILE_PERIOD_LABELS,
  rangeForProfilePeriod,
  type ProfilePeriod,
} from "./time-v2-utils";

export type ProfileTab =
  | "visao"
  | "score"
  | "tarefas"
  | "jornada"
  | "desempenho"
  | "comunicacao"
  | "historico";

const TABS: { value: ProfileTab; label: string }[] = [
  { value: "visao", label: "Visão geral" },
  { value: "score", label: "Score" },
  { value: "tarefas", label: "Tarefas" },
  { value: "jornada", label: "Jornada" },
  { value: "desempenho", label: "Desempenho" },
  { value: "comunicacao", label: "Comunicação" },
  { value: "historico", label: "Histórico" },
];

const PERIOD_OPTIONS = (Object.keys(PROFILE_PERIOD_LABELS) as ProfilePeriod[]).map((value) => ({
  value,
  label: PROFILE_PERIOD_LABELS[value],
}));

type Viewer = { isAdmin: boolean; meId: string | null };

type Props = {
  member: Member | null;
  viewer: Viewer;
  tasksForMember: DashTask[];
  openTasksForMember: PerformanceOpenTask[];
  performanceSettings: PerformanceSettings;
  meetingsById: Map<string, Meeting>;
  initialTab?: ProfileTab;
  onOpenTask: (t: DashTask) => void;
  onClose: () => void;
  onEdit: (m: Member) => void;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
};

/**
 * PERFIL CENTRAL do membro — o único lugar da aba Time (e, a partir dela,
 * da plataforma) que representa uma pessoa. Toda linha/gráfico/insight que
 * mostra alguém abre este mesmo painel; Score, Tarefas, Jornada,
 * Desempenho, Comunicação e Histórico são abas dele, nunca telas ou modais
 * separados. Um único seletor de período (Hoje/Semana/Mês/Personalizado)
 * vale para todas as abas. Só a aba ativa é montada — a RPC de tempo de
 * resposta e os eventos do Score só buscam quando a aba é aberta.
 */
export function MemberProfileV2({ member, onClose, ...rest }: Props) {
  return (
    <Sheet open={!!member} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:w-[92vw] sm:max-w-[880px]"
      >
        {member && <ProfileBody key={member.id} member={member} onClose={onClose} {...rest} />}
      </SheetContent>
    </Sheet>
  );
}

function ProfileBody({
  member,
  viewer,
  tasksForMember,
  openTasksForMember,
  performanceSettings,
  meetingsById,
  initialTab = "visao",
  onOpenTask,
  onEdit,
  onDelete,
  onReset,
}: Omit<Props, "member"> & { member: Member }) {
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [period, setPeriod] = useState<ProfilePeriod>("mes");
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => {
    const t = todayIsoInBrasilia();
    return { from: t.slice(0, 8) + "01", to: t };
  });
  const [openComposition, setOpenComposition] = useState(false);

  const range = useMemo(() => rangeForProfilePeriod(period, custom), [period, custom]);

  const perf = useMemberPerformance(
    member.id,
    range,
    openTasksForMember,
    performanceSettings.deadlineCutoffHour,
  );
  const { entries, loading: entriesLoading } = useTeamTimeEntries(range, member.id);

  const status = getStatus(member.id);
  const showName = canSeeField(member, "name", viewer);
  const showRole = canSeeField(member, "role", viewer);
  const isSelf = viewer.meId === member.id;
  const totalSeconds = useMemo(() => entries.reduce((s, e) => s + entrySeconds(e), 0), [entries]);
  const stats = useMemo(() => memberTaskStats(tasksForMember), [tasksForMember]);
  const overdueTasks = useMemo(
    () => tasksForMember.filter((t) => t.bucket === "atrasada" && t.status !== "Concluído"),
    [tasksForMember],
  );
  const projectNames = useMemo(
    () => Array.from(new Set(tasksForMember.map((t) => t.projectName))),
    [tasksForMember],
  );
  const missed = perf.attendance.filter((a) => !a.attended).length;
  const openById = (id: string) => {
    const t = tasksForMember.find((x) => x.id === id);
    if (t) onOpenTask(t);
  };
  const displayName = showName ? member.name || "(sem nome)" : "Membro";

  return (
    <>
      <SheetHeader className="space-y-3 border-b border-border px-5 py-4 text-left sm:px-7">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative shrink-0">
              <Avatar className="h-14 w-14">
                {member.photo && <AvatarImage src={member.photo} alt="" className="object-cover" />}
                <AvatarFallback className={`text-lg font-semibold ${avatarAccent(member.id)}`}>
                  {initialsOf(showName ? member.name : "", member.email)}
                </AvatarFallback>
              </Avatar>
              <PresenceDot status={status} />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">{displayName}</SheetTitle>
              <SheetDescription className="flex min-w-0 items-center gap-2 truncate">
                <span className="truncate">{showRole && member.role ? member.role : "—"}</span>
                <span aria-hidden>·</span>
                <span className="shrink-0">{STATUS_LABEL[status]}</span>
                {member.isAdmin && (
                  <ShieldCheck className="h-3 w-3 shrink-0" aria-label="Administrador" />
                )}
              </SheetDescription>
            </div>
          </div>
          {viewer.isAdmin && (
            <div className="mr-8 flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onEdit(member)}
              >
                <Pencil className="h-3.5 w-3.5" /> Editar membro
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Mais ações do membro">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onReset(member.id)}>
                    Redefinir senha
                  </DropdownMenuItem>
                  {!isSelf && (
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => onDelete(member.id)}
                    >
                      Remover membro
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Período do perfil"
            size="sm"
            value={period}
            onChange={setPeriod}
            options={PERIOD_OPTIONS}
          />
          {period === "personalizado" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label="Data inicial"
                value={custom.from}
                max={custom.to}
                onChange={(e) =>
                  e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))
                }
                className="h-8 w-[9.5rem] text-xs"
              />
              <span className="text-xs text-text-secondary">até</span>
              <Input
                type="date"
                aria-label="Data final"
                value={custom.to}
                min={custom.from}
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
                className="h-8 w-[9.5rem] text-xs"
              />
            </div>
          )}
        </div>
      </SheetHeader>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ProfileTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border px-5 py-2 sm:px-7">
          <TabsList className="h-9">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <TabsContent value="visao" className="mt-0">
            <ProfileOverview
              member={member}
              viewer={viewer}
              stats={stats}
              completedCount={perf.completions.length}
              scoreValue={perf.score.score}
              totalSeconds={totalSeconds}
              overdueTasks={overdueTasks}
              onOpenTask={onOpenTask}
              startOfDayToday={member.startTimes?.[todayIsoInBrasilia()] ?? null}
            />
            <button
              type="button"
              onClick={() => {
                setOpenComposition(true);
                setTab("score");
              }}
              className="mt-4 text-[11px] font-medium text-text-secondary underline underline-offset-2 hover:text-foreground"
            >
              Ver composição do Score →
            </button>
          </TabsContent>
          <TabsContent value="score" className="mt-0">
            <ScoreOperacionalPanel
              score={perf.score}
              trendLabel={perf.trendLabel}
              completions={perf.completions}
              deadlineChanges={perf.deadlineChanges}
              attendance={perf.attendance}
              meetingsById={meetingsById}
              performanceSettings={performanceSettings}
              tasksForMember={tasksForMember}
              openById={openById}
              initialShowComposition={openComposition}
            />
          </TabsContent>
          <TabsContent value="tarefas" className="mt-0">
            <ProfileTasks tasks={tasksForMember} onOpenTask={onOpenTask} />
          </TabsContent>
          <TabsContent value="jornada" className="mt-0">
            <ProfileJourney
              member={member}
              entries={entries}
              loading={entriesLoading}
              statusLabel={STATUS_LABEL[status]}
              canSeeStart={canSeeField(member, "startOfDay", viewer)}
            />
          </TabsContent>
          <TabsContent value="desempenho" className="mt-0">
            <ProfilePerformance
              completed={perf.completions.length}
              previousCompleted={perf.previousCompletions.length}
              agg={perf.aggCurrent}
              previousAgg={perf.aggPrevious}
              overdueNow={perf.overdueNow.length}
              meetingsAttended={perf.attendance.length - missed}
              meetingsExpected={perf.attendance.length}
              totalSeconds={totalSeconds}
            />
          </TabsContent>
          <TabsContent value="comunicacao" className="mt-0">
            <ProfileCommunication memberId={member.id} range={range} />
          </TabsContent>
          <TabsContent value="historico" className="mt-0">
            <ProfileHistory
              completions={perf.completions}
              deadlineChanges={perf.deadlineChanges}
              attendance={perf.attendance}
              meetingsById={meetingsById}
              projectNames={projectNames}
            />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
