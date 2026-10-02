import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  Gauge,
  History,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { formatResponseDuration } from "@/lib/member-response-time";
import { todayIsoInBrasilia } from "@/lib/timezone";
import { useTeamTimeEntries } from "@/lib/time-entries";
import { ProfileCommunication } from "./ProfileCommunication";
import {
  MemberInfoSection,
  ProfileActivity,
  ProfileHistory,
  ProfileJourney,
  ProfilePerformance,
  ProfileScoreSummary,
  ProfileSection,
  ProfileSummary,
  type SummaryItem,
} from "./profile-sections";
import {
  orderSections,
  SECTION_LABEL,
  SORT_LABEL,
  type ProfileSort,
  type SectionId,
} from "./profile-order";
import { useMemberResponseTimeData } from "./use-response-time";
import {
  canSeeField,
  entrySeconds,
  memberTaskStats,
  PROFILE_PERIOD_LABELS,
  rangeForProfilePeriod,
  type ProfilePeriod,
} from "./time-v2-utils";

const PERIOD_OPTIONS = (Object.keys(PROFILE_PERIOD_LABELS) as ProfilePeriod[]).map((value) => ({
  value,
  label: PROFILE_PERIOD_LABELS[value],
}));

const SECTION_ICON: Record<SectionId, ReactNode> = {
  atividade: <ClipboardList className="h-4 w-4" />,
  jornada: <Clock className="h-4 w-4" />,
  desempenho: <BarChart3 className="h-4 w-4" />,
  comunicacao: <MessageSquare className="h-4 w-4" />,
  historico: <History className="h-4 w-4" />,
};

const SECTION_TITLE: Record<SectionId, string> = {
  atividade: "Atividade",
  jornada: "Jornada",
  desempenho: "Desempenho",
  comunicacao: "Comunicação",
  historico: "Histórico",
};

type Viewer = { isAdmin: boolean; meId: string | null };

type Props = {
  member: Member | null;
  viewer: Viewer;
  tasksForMember: DashTask[];
  openTasksForMember: PerformanceOpenTask[];
  performanceSettings: PerformanceSettings;
  meetingsById: Map<string, Meeting>;
  onOpenTask: (t: DashTask) => void;
  onClose: () => void;
  onEdit: (m: Member) => void;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
};

/**
 * PERFIL CENTRAL do membro — uma única experiência contínua (sem abas):
 * cabeçalho → faixa de resumo → filtros/âncoras + ordenação → seções
 * (Atividade, Jornada, Desempenho com Score, Comunicação, Histórico) →
 * informações cadastrais. Os chips apenas rolam até a seção e a destacam;
 * "Ordenar" só reorganiza as mesmas seções. Um único seletor de período
 * vale para tudo. Dados buscados uma vez no topo (eventos do Score, horas,
 * tempo de resposta agregado) e compartilhados entre resumo e seções.
 */
export function MemberProfileV2({ member, onClose, ...rest }: Props) {
  return (
    <Sheet open={!!member} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:w-[92vw] sm:max-w-[880px]"
      >
        {member && <ProfileBody key={member.id} member={member} {...rest} />}
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
  onOpenTask,
  onEdit,
  onDelete,
  onReset,
}: Omit<Props, "member" | "onClose"> & { member: Member }) {
  const [period, setPeriod] = useState<ProfilePeriod>("mes");
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => {
    const t = todayIsoInBrasilia();
    return { from: t.slice(0, 8) + "01", to: t };
  });
  const [sort, setSort] = useState<ProfileSort>("padrao");
  const [activeChip, setActiveChip] = useState<SectionId | "tudo">("tudo");
  const [highlight, setHighlight] = useState<SectionId | null>(null);
  const [scoreExpanded, setScoreExpanded] = useState(false);

  const range = useMemo(() => rangeForProfilePeriod(period, custom), [period, custom]);

  const perf = useMemberPerformance(
    member.id,
    range,
    openTasksForMember,
    performanceSettings.deadlineCutoffHour,
  );
  const { entries, loading: entriesLoading } = useTeamTimeEntries(range, member.id);
  const rt = useMemberResponseTimeData(member.id, range);

  const status = getStatus(member.id);
  const showName = canSeeField(member, "name", viewer);
  const showRole = canSeeField(member, "role", viewer);
  const isSelf = viewer.meId === member.id;
  const totalSeconds = useMemo(() => entries.reduce((s, e) => s + entrySeconds(e), 0), [entries]);
  const stats = useMemo(() => memberTaskStats(tasksForMember), [tasksForMember]);
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

  // Seções que pedem atenção (alimenta "Ordenar → Maior atenção").
  const order = useMemo(
    () =>
      orderSections(sort, {
        atividade: stats.atrasadas > 0,
        jornada: false,
        desempenho: perf.score.dataState !== "sem_dados" && (perf.score.score ?? 100) < 60,
        comunicacao: (rt.data?.all.unanswered ?? 0) > 0,
      }),
    [sort, stats.atrasadas, perf.score.dataState, perf.score.score, rt.data],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});
  const highlightTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const goTo = useCallback((id: SectionId) => {
    setActiveChip(id);
    const el = sectionRefs.current[id];
    if (!el) return;
    el.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    setHighlight(id);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlight(null), 1600);
  }, []);

  const goTop = () => {
    setActiveChip("tudo");
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const rtAvg = rt.data?.all.averageSeconds ?? null;
  const summary: SummaryItem[] = [
    {
      key: "concluidas",
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "Concluídas",
      value: perf.completions.length,
      onClick: () => goTo("atividade"),
    },
    {
      key: "atrasadas",
      icon: <AlertTriangle className="h-3 w-3" />,
      label: "Atrasadas",
      value: stats.atrasadas,
      hint: "agora",
      tone: stats.atrasadas > 0 ? "danger" : undefined,
      onClick: () => goTo("atividade"),
    },
    {
      key: "horas",
      icon: <Clock className="h-3 w-3" />,
      label: "Horas",
      value: totalSeconds > 0 ? `${(totalSeconds / 3600).toFixed(1).replace(".", ",")}h` : "—",
      onClick: () => goTo("jornada"),
    },
    {
      key: "resposta",
      icon: <MessageSquare className="h-3 w-3" />,
      label: "Resposta média",
      value:
        rt.state === "loading"
          ? "…"
          : rt.state === "error" || rtAvg == null
            ? "—"
            : formatResponseDuration(rtAvg),
      hint:
        rt.state === "ready" && rtAvg == null
          ? "Sem dados suficientes"
          : rt.state === "error"
            ? "Indisponível"
            : undefined,
      onClick: () => goTo("comunicacao"),
    },
    {
      key: "score",
      icon: <Gauge className="h-3 w-3" />,
      label: "Score",
      value: perf.score.score == null ? "—" : perf.score.score,
      hint: perf.score.dataState === "sem_dados" ? "Sem dados suficientes" : undefined,
      onClick: () => goTo("desempenho"),
    },
  ];

  const chips: { id: SectionId | "tudo"; label: string; icon: ReactNode }[] = [
    { id: "tudo", label: "Tudo", icon: <Eye className="h-3.5 w-3.5" /> },
    ...(["atividade", "jornada", "desempenho", "comunicacao", "historico"] as SectionId[]).map(
      (id) => ({ id, label: SECTION_LABEL[id], icon: SECTION_ICON[id] }),
    ),
  ];

  const renderSection = (id: SectionId) => {
    const common = {
      id,
      icon: SECTION_ICON[id],
      title: SECTION_TITLE[id],
      highlighted: highlight === id,
    };
    const setRef = (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    };
    switch (id) {
      case "atividade":
        return (
          <ProfileSection key={id} ref={setRef} {...common}>
            <ProfileActivity tasks={tasksForMember} onOpenTask={onOpenTask} />
          </ProfileSection>
        );
      case "jornada":
        return (
          <ProfileSection key={id} ref={setRef} {...common}>
            <ProfileJourney
              member={member}
              entries={entries}
              loading={entriesLoading}
              statusLabel={STATUS_LABEL[status]}
              canSeeStart={canSeeField(member, "startOfDay", viewer)}
            />
          </ProfileSection>
        );
      case "desempenho":
        return (
          <ProfileSection key={id} ref={setRef} {...common}>
            <div className="space-y-3">
              <ProfileScoreSummary
                score={perf.score}
                trendLabel={perf.trendLabel}
                expanded={scoreExpanded}
                onToggle={() => setScoreExpanded((e) => !e)}
              />
              {scoreExpanded && (
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
                  initialShowComposition
                />
              )}
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
            </div>
          </ProfileSection>
        );
      case "comunicacao":
        return (
          <ProfileSection key={id} ref={setRef} {...common} title="Comunicação · Tempo de resposta">
            <ProfileCommunication data={rt.data} state={rt.state} />
          </ProfileSection>
        );
      case "historico":
        return (
          <ProfileSection key={id} ref={setRef} {...common}>
            <ProfileHistory
              completions={perf.completions}
              deadlineChanges={perf.deadlineChanges}
              attendance={perf.attendance}
              meetingsById={meetingsById}
              projectNames={projectNames}
            />
          </ProfileSection>
        );
    }
  };

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
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Editar membro</span>
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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-5 pb-8 pt-4 sm:px-7">
          <ProfileSummary items={summary} />
        </div>

        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-y border-border bg-background/95 px-5 py-2 backdrop-blur sm:px-7">
          <div
            role="toolbar"
            aria-label="Seções do perfil"
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {chips.map((c) => {
              const active = activeChip === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => (c.id === "tudo" ? goTop() : goTo(c.id))}
                  className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? "border-primary bg-primary/10 text-foreground" : "border-border text-text-secondary hover:bg-muted/50 hover:text-foreground"}`}
                >
                  {c.icon}
                  {c.label}
                </button>
              );
            })}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5" />
                Ordenar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {(Object.keys(SORT_LABEL) as ProfileSort[]).map((key) => (
                <DropdownMenuItem key={key} onSelect={() => setSort(key)} className="gap-2">
                  <Check className={`h-3.5 w-3.5 ${sort === key ? "opacity-100" : "opacity-0"}`} />
                  {SORT_LABEL[key]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-4 px-5 pb-10 pt-4 sm:px-7">
          {order.map(renderSection)}
          <MemberInfoSection
            member={member}
            viewer={viewer}
            startOfDayToday={member.startTimes?.[todayIsoInBrasilia()] ?? null}
          />
        </div>
      </div>
    </>
  );
}
