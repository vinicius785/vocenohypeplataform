import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DateField } from "@/components/ui/date-field";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  X,
  Map,
  KanbanSquare,
  Users,
  FileText,
  ImageIcon,
  Check,
  ExternalLink,
  CalendarDays,
  Megaphone,
  Newspaper,
  LayoutList,
  LayoutPanelTop,
  Radar,
  Bug,
  Mail,
  Sheet,
  Presentation,
  HardDrive,
  Figma,
  StickyNote,
  Notebook,
  Palette,
  Link as LinkIcon,
  Pin,
  PinOff,
  Copy,
  MoreHorizontal,
  Paperclip,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/hooks/use-confirm";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import { AppShell, type SectionKey } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { MarketingSection } from "@/components/MarketingSection";
import { ProjectBugsPanel } from "@/components/projetos/ProjectBugsPanel";
import {
  TaskBoard,
  TaskDialog as SharedTaskDialog,
  type Task as BoardTask,
} from "@/components/tasks/TaskBoard";
import {
  FEATURES,
  getProjeto,
  onProjetosChange,
  upsertProjeto,
  type FeatureKey,
  type Project,
  type ProjectLayout,
  type Task,
  type Milestone,
  type DocItem,
  type DocSourceType,
  type DocCategory,
  type SectionItem,
} from "@/lib/projetos";
import { EditorialPanel } from "@/components/marketing/EditorialPanel";
import { TrafegoPagoPanel } from "@/components/marketing/TrafegoPagoPanel";
import { BlogPanel } from "@/components/marketing/BlogPanel";
import { AeoMonitorPanel } from "@/components/marketing/AeoMonitorPanel";
import { FluxosEmailPanel } from "@/components/marketing/FluxosEmailPanel";
import { formatIsoDate } from "@/lib/utils";
import {
  InfluencerBoard,
  normalizeInflus,
  type Influ,
} from "@/components/influenciadores/InfluencerBoard";
import {
  loadProjetoInflus,
  saveProjetoInflus,
  onProjetoInflusChange,
  saveProjetoTarefas,
  loadProjetoFases,
  saveProjetoFases,
  onProjetoFasesChange,
} from "@/lib/projeto-scoped-store";
import { tarefasSemFase, type ProjetoFase } from "@/lib/roadmap-engine";
import { PhaseFormDialog } from "@/components/roadmap/PhaseFormDialog";
import { LinkTasksPanel } from "@/components/roadmap/LinkTasksPanel";
import { PhaseTimeline } from "@/components/roadmap/PhaseTimeline";
import { RoadmapOverviewTab } from "@/components/roadmap/RoadmapOverviewTab";

export const Route = createFileRoute("/_authenticated/projeto/$id")({
  component: ProjetoPage,
  validateSearch: (search: Record<string, unknown>): { taskId?: string } => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
  head: ({ params }) => ({ meta: [{ title: `Projeto · ${params.id.slice(0, 6)}` }] }),
});

const ICONS: Record<FeatureKey, React.ComponentType<{ className?: string }>> = {
  roadmap: Map,
  kanban: KanbanSquare,
  influenciadores: Users,
  documentos: FileText,
  calendario_editorial: CalendarDays,
  trafego_pago: Megaphone,
  blog: Newspaper,
  aeo_monitor: Radar,
  bugs_sugestoes: Bug,
  fluxos_email: Mail,
};

function renderPanel(
  k: FeatureKey,
  project: Project,
  update: (p: Partial<Project>) => void,
  initialOpenTaskId?: string,
  onInitialOpenTaskHandled?: () => void,
) {
  const isMarketingProject = project.name.trim().toUpperCase() === "MARKETING";
  if (k === "roadmap") return <RoadmapPanel project={project} update={update} />;
  if (k === "kanban")
    return isMarketingProject ? (
      <MarketingSection
        initialOpenTaskId={initialOpenTaskId}
        onInitialOpenTaskHandled={onInitialOpenTaskHandled}
      />
    ) : (
      <KanbanPanel
        project={project}
        update={update}
        initialOpenTaskId={initialOpenTaskId}
        onInitialOpenTaskHandled={onInitialOpenTaskHandled}
      />
    );
  if (k === "influenciadores") return <InfluencersPanel project={project} update={update} />;
  if (k === "documentos") return <DocsPanel project={project} update={update} />;
  if (k === "calendario_editorial") return <EditorialPanel project={project} update={update} />;
  if (k === "trafego_pago") return <TrafegoPagoPanel project={project} update={update} />;
  if (k === "blog") return <BlogPanel project={project} update={update} />;
  if (k === "aeo_monitor") return <AeoMonitorPanel />;
  if (k === "bugs_sugestoes") return <ProjectBugsPanel project={project} update={update} />;
  if (k === "fluxos_email") return <FluxosEmailPanel />;
  return <SectionPanel project={project} update={update} featureKey={k} />;
}

function ProjetoPage() {
  const { id } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(() => getProjeto(id) ?? null);
  const [tab, setTab] = useState<FeatureKey | null>(null);

  useEffect(() => {
    if (project && !tab)
      setTab(
        taskId && project.features.includes("kanban") ? "kanban" : (project.features[0] ?? null),
      );
  }, [project, tab, taskId]);

  // Força a troca pra aba Kanban toda vez que chega um `taskId` NOVO via
  // deep-link (ex.: clique no indicador global de timer ativo) — sem
  // isso, se a pessoa já estivesse nesta mesma página de projeto numa
  // aba diferente (ex. Documentos), o efeito acima nunca reagia de novo
  // (só roda quando `tab` ainda é null, ou seja, só no primeiro
  // carregamento) e o parâmetro de busca mudava sem a tela visivelmente
  // reagir — parecia que "clicar não abria nada".
  const prevTaskIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (taskId && taskId !== prevTaskIdRef.current && project?.features.includes("kanban")) {
      setTab("kanban");
    }
    prevTaskIdRef.current = taskId;
  }, [taskId, project]);

  const clearTaskId = () => {
    navigate({ to: "/projeto/$id", params: { id }, search: {}, replace: true });
  };

  useEffect(() => onProjetosChange(() => setProject(getProjeto(id) ?? null)), [id]);

  const update = (patch: Partial<Project>) => {
    if (!project) return;
    const next = { ...project, ...patch };
    setProject(next);
    // Tarefas são gravadas à parte (projeto_tarefas, per-row) em vez de
    // dentro do upsert do projeto inteiro — evita que uma edição de tarefa
    // sobrescreva, com dados desatualizados, tarefas que outra aba/pessoa
    // acabou de criar/editar no mesmo projeto (ver projeto-scoped-store.ts).
    const { tasks, ...rest } = patch;
    if (tasks) saveProjetoTarefas(id, tasks as unknown as BoardTask[]);
    if (Object.keys(rest).length > 0) upsertProjeto(next);
  };

  const goToSection = (key: SectionKey) => {
    navigate({ to: "/time", search: { section: key } });
  };

  const layout: ProjectLayout = project?.layout ?? "tabs";
  const setLayout = (l: ProjectLayout) => update({ layout: l });

  if (!project) {
    return (
      <AppShell active="projetos" onSelect={goToSection}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">Projeto não encontrado.</p>
          <BackButton
            onClick={() => void navigate({ to: "/time", search: { section: "projetos" } })}
          />
        </div>
      </AppShell>
    );
  }

  // Projeto "HypeApp" ganha a aba de Bugs & Sugestões automaticamente,
  // mesmo padrão de nome especial já usado pro projeto "MARKETING" — sem
  // precisar que alguém lembre de habilitar a feature manualmente.
  const isHypeAppProject = project.name.trim().toLowerCase() === "hypeapp";
  const featuresWithHypeApp =
    isHypeAppProject && !project.features.includes("bugs_sugestoes")
      ? [...project.features, "bugs_sugestoes" as const]
      : project.features;
  const availableTabs = featuresWithHypeApp;

  return (
    <AppShell active="projetos" onSelect={goToSection}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <BackButton onClick={() => goToSection("projetos")} />

        {/* Header — foto/ícone + nome + descrição */}
        <header className="flex items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
            {project.cover ? (
              <img src={project.cover} alt={project.name} className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-1 max-w-2xl truncate text-sm text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>
          {availableTabs.length > 0 && (
            <div className="inline-flex shrink-0 rounded-md border border-border bg-background p-0.5">
              <button
                onClick={() => setLayout("tabs")}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  layout === "tabs"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="Ver em abas"
              >
                <LayoutPanelTop className="h-3.5 w-3.5" />
                Abas
              </button>
              <button
                onClick={() => setLayout("single")}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  layout === "single"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="Ver em página única"
              >
                <LayoutList className="h-3.5 w-3.5" />
                Página única
              </button>
            </div>
          )}
        </header>

        <div>
          {availableTabs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma funcionalidade habilitada para este projeto.
            </p>
          ) : (
            <>
              {layout === "tabs" ? (
                <>
                  <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
                    {availableTabs.map((k) => {
                      const meta = FEATURES.find((x) => x.key === k);
                      if (!meta) return null;
                      const Icon = ICONS[k];
                      const active = tab === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setTab(k)}
                          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                            active
                              ? "border-foreground text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                  {tab && renderPanel(tab, project, update, taskId, clearTaskId)}
                </>
              ) : (
                <div className="space-y-10">
                  {availableTabs.map((k) => {
                    const meta = FEATURES.find((x) => x.key === k);
                    if (!meta) return null;
                    const Icon = ICONS[k];
                    return (
                      <section key={k} className="scroll-mt-4">
                        {/* "Arquivos e links" desenha seu próprio cabeçalho
                            (título + botão "+ Adicionar" na mesma linha) —
                            suprime só este aqui pra não duplicar. Toda outra
                            seção continua exatamente como antes. */}
                        {k !== "documentos" && (
                          <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
                          </div>
                        )}
                        {renderPanel(k, project, update, taskId, clearTaskId)}
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/* -------- Roadmap -------- */
function RoadmapPanel({
  project,
  update,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
}) {
  const access = useMyAccess();
  const canEdit = hasPermission(access, "projetos");
  const confirm = useConfirm();

  const [fases, setFases] = useState<ProjetoFase[]>(() => loadProjetoFases(project.id));
  useEffect(() => {
    setFases(loadProjetoFases(project.id));
    return onProjetoFasesChange(() => setFases(loadProjetoFases(project.id)));
  }, [project.id]);
  const updateFases = (list: ProjetoFase[]) => {
    setFases(list);
    saveProjetoFases(project.id, list);
  };

  const semFase = useMemo(
    () => tarefasSemFase(project.tasks as unknown as BoardTask[], fases),
    [project.tasks, fases],
  );

  // Marco (mantido da versão anterior — item 11 do pedido, agora aceita
  // uma fase opcional).
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [marcoFaseId, setMarcoFaseId] = useState("");

  const addMarco = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const task: Task = {
      id: crypto.randomUUID(),
      title: title.trim(),
      status: "Aberto",
      dueDate: date || undefined,
      roadmapPhaseId: marcoFaseId || undefined,
    };
    const m: Milestone = {
      id: crypto.randomUUID(),
      title: title.trim(),
      date,
      done: false,
      taskId: task.id,
      faseId: marcoFaseId || undefined,
    };
    update({ milestones: [...project.milestones, m], tasks: [...project.tasks, task] });
    setTitle("");
    setDate("");
    setMarcoFaseId("");
  };

  const removeMarco = (id: string) => {
    const m = project.milestones.find((x) => x.id === id);
    update({
      milestones: project.milestones.filter((x) => x.id !== id),
      tasks: m?.taskId ? project.tasks.filter((t) => t.id !== m.taskId) : project.tasks,
    });
  };

  // Dialog de tarefa unificado — edita (marco, fase, "sem fase" ou Kanban)
  // e cria (dentro de uma fase) usando SEMPRE o mesmo SharedTaskDialog.
  const [taskDialog, setTaskDialog] = useState<
    { mode: "edit"; taskId: string } | { mode: "new"; defaultFaseId?: string } | null
  >(null);

  const openMilestone = (m: Milestone) => {
    let taskId = m.taskId;
    if (!taskId) {
      const t: Task = {
        id: crypto.randomUUID(),
        title: m.title,
        status: m.done ? "Concluído" : "Aberto",
        dueDate: m.date || undefined,
        roadmapPhaseId: m.faseId,
      };
      taskId = t.id;
      update({
        tasks: [...project.tasks, t],
        milestones: project.milestones.map((x) => (x.id === m.id ? { ...x, taskId } : x)),
      });
    }
    setTaskDialog({ mode: "edit", taskId });
  };

  const saveTaskUnified = (t: Task) => {
    const tasks = project.tasks.some((x) => x.id === t.id)
      ? project.tasks.map((x) => (x.id === t.id ? t : x))
      : [...project.tasks, t];
    const milestones = project.milestones.map((m) =>
      m.taskId === t.id
        ? { ...m, title: t.title, date: t.dueDate ?? m.date, done: t.status === "Concluído" }
        : m,
    );
    update({ tasks, milestones });
  };

  const deleteTaskUnified = (taskId: string) => {
    update({
      tasks: project.tasks.filter((t) => t.id !== taskId),
      milestones: project.milestones.map((m) =>
        m.taskId === taskId ? { ...m, taskId: undefined } : m,
      ),
    });
  };

  const sortedMarcos = useMemo(
    () => [...project.milestones].sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    [project.milestones],
  );

  const editingTask =
    taskDialog?.mode === "edit"
      ? (project.tasks.find((t) => t.id === taskDialog.taskId) ?? null)
      : null;

  // Fase — criar/editar
  const [faseDialogOpen, setFaseDialogOpen] = useState(false);
  const [editingFase, setEditingFase] = useState<ProjetoFase | undefined>(undefined);
  const [pendingSemFaseSelection, setPendingSemFaseSelection] = useState<string[] | null>(null);

  const nowIso = () => new Date().toISOString();

  const saveFase = (partial: Omit<ProjetoFase, "id" | "createdAt" | "updatedAt" | "sortOrder">) => {
    if (editingFase) {
      updateFases(
        fases.map((f) => (f.id === editingFase.id ? { ...f, ...partial, updatedAt: nowIso() } : f)),
      );
    } else {
      const novaFase: ProjetoFase = {
        ...partial,
        id: crypto.randomUUID(),
        sortOrder: fases.length,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      updateFases([...fases, novaFase]);
      if (pendingSemFaseSelection) {
        update({
          tasks: project.tasks.map((t) =>
            pendingSemFaseSelection.includes(t.id) ? { ...t, roadmapPhaseId: novaFase.id } : t,
          ),
        });
        setPendingSemFaseSelection(null);
      }
    }
    setFaseDialogOpen(false);
    setEditingFase(undefined);
  };

  const handleDeleteFase = async (fase: ProjetoFase) => {
    const count = project.tasks.filter((t) => t.roadmapPhaseId === fase.id).length;
    const ok = await confirm.confirm(
      count > 0
        ? `Excluir a fase "${fase.nome}"? ${count} tarefa(s) vinculada(s) não serão apagadas — voltam para "Sem fase".`
        : `Excluir a fase "${fase.nome}"?`,
    );
    if (!ok) return;
    updateFases(fases.filter((f) => f.id !== fase.id));
  };

  const handleDuplicateFase = (fase: ProjetoFase) => {
    updateFases([
      ...fases,
      {
        ...fase,
        id: crypto.randomUUID(),
        nome: `${fase.nome} (cópia)`,
        sortOrder: fases.length,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ]);
  };

  // Vincular tarefas existentes
  const [linkTasksFaseId, setLinkTasksFaseId] = useState<string | null>(null);

  const handleLinkTasks = (taskIds: string[]) => {
    if (!linkTasksFaseId) return;
    update({
      tasks: project.tasks.map((t) =>
        taskIds.includes(t.id) ? { ...t, roadmapPhaseId: linkTasksFaseId } : t,
      ),
    });
  };

  const handleMoveTask = (taskId: string, faseId?: string) => {
    update({
      tasks: project.tasks.map((t) => (t.id === taskId ? { ...t, roadmapPhaseId: faseId } : t)),
    });
  };

  const handleCreateFaseFromSelection = (taskIds: string[]) => {
    setPendingSemFaseSelection(taskIds);
    setEditingFase(undefined);
    setFaseDialogOpen(true);
  };

  return (
    <div className="space-y-8">
      <RoadmapOverviewTab
        fases={fases}
        tasks={project.tasks as unknown as BoardTask[]}
        milestones={project.milestones}
        semFase={semFase}
        onOpenTask={(t) => setTaskDialog({ mode: "edit", taskId: t.id })}
      />

      <PhaseTimeline
        fases={fases}
        tasks={project.tasks as unknown as BoardTask[]}
        semFase={semFase}
        canEdit={canEdit}
        onOpenTask={(t) => setTaskDialog({ mode: "edit", taskId: t.id })}
        onCreateTask={(faseId) => setTaskDialog({ mode: "new", defaultFaseId: faseId })}
        onLinkTasks={(faseId) => setLinkTasksFaseId(faseId)}
        onEditFase={(fase) => {
          setEditingFase(fase);
          setFaseDialogOpen(true);
        }}
        onDuplicateFase={handleDuplicateFase}
        onDeleteFase={(fase) => void handleDeleteFase(fase)}
        onMoveTask={handleMoveTask}
        onNewFase={() => {
          setEditingFase(undefined);
          setFaseDialogOpen(true);
        }}
        onCreateFaseFromSelection={handleCreateFaseFromSelection}
      />

      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Marcos
        </h3>
        {canEdit && (
          <form onSubmit={addMarco} className="flex flex-wrap gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Marco / entrega"
              className="h-8 flex-1 min-w-[200px] rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
            <DateField
              value={date || undefined}
              onChange={(v) => setDate(v ?? "")}
              className="h-8 text-xs"
            />
            <select
              value={marcoFaseId}
              onChange={(e) => setMarcoFaseId(e.target.value)}
              className="h-8 cursor-pointer rounded-md border border-border bg-background px-2 text-xs outline-none"
            >
              <option value="">Sem fase</option>
              {fases.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <button className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">
              <Plus className="h-3.5 w-3.5" /> Adicionar marco
            </button>
          </form>
        )}

        {sortedMarcos.length === 0 ? (
          <EmptyState label="Nenhum marco ainda." />
        ) : (
          <div className="overflow-x-auto pb-4">
            <div
              className="relative min-w-full"
              style={{ minWidth: `${Math.max(sortedMarcos.length * 180, 600)}px` }}
            >
              <div className="absolute left-0 right-0 top-6 h-px bg-border" />
              <ol className="relative flex items-start gap-4">
                {sortedMarcos.map((m) => (
                  <li
                    key={m.id}
                    className="group relative flex flex-1 min-w-[160px] flex-col items-center"
                  >
                    <button
                      onClick={() => openMilestone(m)}
                      aria-label={`Abrir tarefa ${m.title}`}
                      className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${
                        m.done
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
                      }`}
                    >
                      {m.done ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <span className="text-xs font-semibold">{sortedMarcos.indexOf(m) + 1}</span>
                      )}
                    </button>
                    <div className="mt-3 w-full text-center">
                      <button
                        onClick={() => openMilestone(m)}
                        className={`block w-full truncate text-xs font-medium hover:underline ${m.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                        title={m.title}
                      >
                        {m.title}
                      </button>
                      {m.date && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {formatIsoDate(m.date)}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => removeMarco(m.id)}
                        aria-label="Remover"
                        className="absolute right-0 top-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                      >
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>

      {taskDialog && (
        <SharedTaskDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) setTaskDialog(null);
          }}
          initial={taskDialog.mode === "edit" ? (editingTask as unknown as BoardTask) : undefined}
          defaultRoadmapPhaseId={taskDialog.mode === "new" ? taskDialog.defaultFaseId : undefined}
          fases={fases}
          scope={{ kind: "projeto", id: project.id }}
          breadcrumb="Projetos"
          onSave={(t) => {
            saveTaskUnified(t as unknown as Task);
            setTaskDialog(null);
          }}
          onAutosave={(t) => saveTaskUnified(t as unknown as Task)}
          onDelete={
            taskDialog.mode === "edit"
              ? () => {
                  deleteTaskUnified(taskDialog.taskId);
                  setTaskDialog(null);
                }
              : undefined
          }
        />
      )}

      {faseDialogOpen && (
        <PhaseFormDialog
          open={faseDialogOpen}
          onOpenChange={(o) => {
            setFaseDialogOpen(o);
            if (!o) {
              setEditingFase(undefined);
              setPendingSemFaseSelection(null);
            }
          }}
          initial={editingFase}
          onSave={saveFase}
        />
      )}

      {linkTasksFaseId && (
        <LinkTasksPanel
          open={true}
          onOpenChange={(o) => {
            if (!o) setLinkTasksFaseId(null);
          }}
          tasks={project.tasks as unknown as BoardTask[]}
          fases={fases}
          targetFaseId={linkTasksFaseId}
          onLink={(taskIds) => {
            handleLinkTasks(taskIds);
            setLinkTasksFaseId(null);
          }}
        />
      )}

      {confirm.confirmDialog}
    </div>
  );
}

/* -------- Task Dialog compartilhado é importado de @/components/tasks/TaskBoard -------- */

/* -------- Kanban (usa o mesmo TaskBoard das Campanhas) -------- */
function KanbanPanel({
  project,
  update,
  initialOpenTaskId,
  onInitialOpenTaskHandled,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
  initialOpenTaskId?: string;
  onInitialOpenTaskHandled?: () => void;
}) {
  // Fases do roadmap (pra badge/filtro/"agrupar por fase" no board) — só
  // faz sentido quando o projeto tem a feature "roadmap" habilitada, mas
  // carregar aqui é sempre seguro (lista vazia se o projeto não tiver
  // nenhuma fase criada). Carregado direto aqui, e não recebido como
  // prop de cima, porque "Kanban" agora é sua própria aba de novo — não
  // vive mais dentro de "Roadmap" (ver `renderPanel`/`availableTabs`).
  const [fases, setFases] = useState<ProjetoFase[]>(() => loadProjetoFases(project.id));
  useEffect(() => {
    setFases(loadProjetoFases(project.id));
    return onProjetoFasesChange(() => setFases(loadProjetoFases(project.id)));
  }, [project.id]);

  return (
    <TaskBoard
      tasks={project.tasks as unknown as BoardTask[]}
      onChange={(next) => {
        const tasks = next as unknown as Task[];
        update({
          tasks,
          milestones: project.milestones.map((m) => {
            const t = tasks.find((x) => x.id === m.taskId);
            return t
              ? { ...m, title: t.title, date: t.dueDate ?? m.date, done: t.status === "Concluído" }
              : m;
          }),
        });
      }}
      scope={{ kind: "projeto", id: project.id }}
      breadcrumb="Projetos"
      initialOpenTaskId={initialOpenTaskId}
      onInitialOpenTaskHandled={onInitialOpenTaskHandled}
      fases={fases}
    />
  );
}

/* -------- Influencers (mesmo board usado em Campanhas) -------- */
function loadInflus(projectId: string): Influ[] {
  return normalizeInflus(loadProjetoInflus(projectId));
}

function InfluencersPanel({
  project,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
}) {
  const [influs, setInflus] = useState<Influ[]>(() => loadInflus(project.id));
  const persist = (next: Influ[]) => {
    setInflus(next);
    saveProjetoInflus(project.id, next);
  };
  useEffect(() => onProjetoInflusChange(() => setInflus(loadInflus(project.id))), [project.id]);

  return (
    <InfluencerBoard
      influs={influs}
      onChange={persist}
      exportName={project.name}
      allowedFields={project.influencerFeatures}
    />
  );
}

/* -------- Arquivos e links -------- */

/** Detecta a origem só pelo hostname — nunca falha nem bloqueia o
 * cadastro (URL inválida/sem protocolo cai em "link" normalmente). Não
 * busca o título real da página (exigiria uma chamada de servidor e
 * cuidado com SSRF pra URL arbitrária do usuário) — "Nome" continua
 * sempre preenchido manualmente. */
function detectSourceType(url: string): DocSourceType {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return "link";
  }
  if (host.includes("docs.google.com")) return "google_docs";
  if (host.includes("sheets.google.com")) return "google_sheets";
  if (host.includes("slides.google.com")) return "google_slides";
  if (host.includes("drive.google.com")) return "google_drive";
  if (host.includes("figma.com")) return "figma";
  if (host.includes("miro.com")) return "miro";
  if (host.includes("notion.so") || host.includes("notion.site")) return "notion";
  if (host.includes("canva.com")) return "canva";
  return "link";
}

const DOC_SOURCE_META: Record<DocSourceType, { icon: LucideIcon; label: string }> = {
  google_docs: { icon: FileText, label: "Google Docs" },
  google_sheets: { icon: Sheet, label: "Google Sheets" },
  google_slides: { icon: Presentation, label: "Google Slides" },
  google_drive: { icon: HardDrive, label: "Google Drive" },
  figma: { icon: Figma, label: "Figma" },
  miro: { icon: StickyNote, label: "Miro" },
  notion: { icon: Notebook, label: "Notion" },
  canva: { icon: Palette, label: "Canva" },
  link: { icon: LinkIcon, label: "Link externo" },
};

const DOC_CATEGORIES: DocCategory[] = [
  "briefing",
  "planejamento",
  "apresentacao",
  "relatorio",
  "contrato",
  "referencia",
  "outro",
];
const DOC_CATEGORY_LABEL: Record<DocCategory, string> = {
  briefing: "Briefing",
  planejamento: "Planejamento",
  apresentacao: "Apresentação",
  relatorio: "Relatório",
  contrato: "Contrato",
  referencia: "Referência",
  outro: "Outro",
};

/** Formulário compacto de link — reaproveitado tanto por "+ Adicionar"
 * quanto por "Editar" (`initial` presente pré-preenche e troca o texto
 * do botão). */
function DocLinkForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: DocItem;
  onSubmit: (data: { name: string; url: string; category: DocCategory }) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<DocCategory>(initial?.category ?? "outro");
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    urlRef.current?.focus();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit({ name: name.trim(), url: url.trim(), category });
  };

  return (
    <form onSubmit={submit} className="space-y-2 p-3">
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">URL</span>
        <input
          ref={urlRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Nome</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do material"
          className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Categoria</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as DocCategory)}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        >
          {DOC_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {DOC_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          {initial ? "Salvar" : "Adicionar"}
        </button>
      </div>
    </form>
  );
}

function DocRow({
  doc,
  onEdit,
  onTogglePin,
  onDelete,
}: {
  doc: DocItem;
  onEdit: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const sourceType = doc.sourceType ?? detectSourceType(doc.url);
  const category = doc.category ?? "outro";
  const { icon: SourceIcon, label: sourceLabel } = DOC_SOURCE_META[sourceType];

  const copyLink = () => {
    void navigator.clipboard.writeText(doc.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="group flex items-center gap-2.5 px-3 py-2">
      <SourceIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {doc.isPinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            title={doc.name}
            className="min-w-0 truncate text-sm text-foreground hover:underline"
          >
            {doc.name}
          </a>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {sourceLabel} · {DOC_CATEGORY_LABEL[category]}
        </p>
      </div>
      {copied && <span className="shrink-0 text-[11px] text-muted-foreground">Copiado!</span>}
      <a
        href={doc.url}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir"
        className="shrink-0 rounded p-1 opacity-0 hover:bg-muted group-hover:opacity-100"
      >
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
      </a>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Mais ações"
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <a href={doc.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTogglePin}>
            {doc.isPinned ? (
              <>
                <PinOff className="h-3.5 w-3.5" /> Desafixar do projeto
              </>
            ) : (
              <>
                <Pin className="h-3.5 w-3.5" /> Fixar no projeto
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={copyLink}>
            <Copy className="h-3.5 w-3.5" /> Copiar link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <X className="h-3.5 w-3.5" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DocsPanel({
  project,
  update,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<"choose" | "link">("choose");
  const [editing, setEditing] = useState<DocItem | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const closeAdd = () => {
    setAddOpen(false);
    setAddStep("choose");
  };

  const createDoc = (data: { name: string; url: string; category: DocCategory }) => {
    const d: DocItem = {
      id: crypto.randomUUID(),
      name: data.name || data.url,
      url: data.url,
      category: data.category,
      isPinned: false,
      sourceType: detectSourceType(data.url),
    };
    update({ docs: [...project.docs, d] });
    closeAdd();
  };

  const saveEdit = (data: { name: string; url: string; category: DocCategory }) => {
    if (!editing) return;
    update({
      docs: project.docs.map((x) =>
        x.id === editing.id
          ? {
              ...x,
              name: data.name || data.url,
              url: data.url,
              category: data.category,
              sourceType: detectSourceType(data.url),
            }
          : x,
      ),
    });
    setEditing(null);
  };

  const togglePin = (id: string) =>
    update({
      docs: project.docs.map((x) => (x.id === id ? { ...x, isPinned: !x.isPinned } : x)),
    });

  const remove = async (id: string, name: string) => {
    if (!(await confirm(`Excluir "${name}"? Isso não pode ser desfeito.`))) return;
    update({ docs: project.docs.filter((x) => x.id !== id) });
  };

  // Fixados primeiro — `sort` é estável, então a ordem relativa dentro
  // de cada grupo (fixados / não-fixados) nunca muda, só o agrupamento.
  const sortedDocs = [...project.docs].sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Arquivos e links</h2>
        </div>
        <Popover
          open={addOpen}
          onOpenChange={(o) => {
            setAddOpen(o);
            if (!o) setAddStep("choose");
          }}
        >
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90">
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            {addStep === "choose" ? (
              <div className="p-1">
                <p className="px-2 py-1.5 text-[11px] font-semibold text-foreground">
                  Adicionar ao projeto
                </p>
                <button
                  type="button"
                  onClick={() => setAddStep("link")}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted/60"
                >
                  <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>
                    <span className="block text-foreground">Adicionar link</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Google Drive, Docs, Figma, Miro, Notion, Canva etc.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled
                  title="Ainda não disponível — sem infraestrutura de upload"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs opacity-40"
                >
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>
                    <span className="block text-foreground">Enviar arquivo</span>
                    <span className="block text-[11px] text-muted-foreground">
                      PDF, imagem, planilha, apresentação etc.
                    </span>
                  </span>
                </button>
              </div>
            ) : (
              <DocLinkForm onSubmit={createDoc} onCancel={closeAdd} />
            )}
          </PopoverContent>
        </Popover>
      </div>

      {project.docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum material adicionado ainda. Adicione links importantes deste projeto.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border bg-background">
          {sortedDocs.map((d) => (
            <DocRow
              key={d.id}
              doc={d}
              onEdit={() => setEditing(d)}
              onTogglePin={() => togglePin(d.id)}
              onDelete={() => void remove(d.id, d.name)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xs gap-0 p-0">
          <DialogTitle className="px-3 pt-3 text-xs font-semibold text-foreground">
            Editar material
          </DialogTitle>
          {editing && (
            <DocLinkForm initial={editing} onSubmit={saveEdit} onCancel={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-8 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* -------- Generic Section (marketing) -------- */
function SectionPanel({
  project,
  update,
  featureKey,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
  featureKey: FeatureKey;
}) {
  const items = project.sections?.[featureKey] ?? [];
  const ph = { title: "Título", note: "Observação", url: "URL" };
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [url, setUrl] = useState("");

  const setItems = (next: SectionItem[]) =>
    update({ sections: { ...(project.sections ?? {}), [featureKey]: next } });

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        note: note.trim() || undefined,
        date: date || undefined,
        url: url.trim() || undefined,
      },
    ]);
    setTitle("");
    setNote("");
    setDate("");
    setUrl("");
  };
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));

  const inputCls =
    "h-8 flex-1 min-w-[140px] rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={ph.title}
          className={inputCls}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={ph.note}
          className={inputCls}
        />
        <DateField
          value={date || undefined}
          onChange={(v) => setDate(v ?? "")}
          className={inputCls}
        />
        {ph.url && (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={ph.url}
            className={inputCls}
          />
        )}
        <button className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState label="Nada por aqui ainda." />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-background">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{i.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[i.date, i.note].filter(Boolean).join(" · ")}
                </p>
              </div>
              {i.url && (
                <a
                  href={i.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Abrir"
                  className="rounded p-1 hover:bg-muted"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </a>
              )}
              <button
                onClick={() => remove(i.id)}
                aria-label="Remover"
                className="rounded p-1 hover:bg-muted"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
