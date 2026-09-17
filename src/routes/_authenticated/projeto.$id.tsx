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
  ExternalLink,
  CalendarDays,
  Megaphone,
  Newspaper,
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
  Trash2,
  Search,
  Flag,
  CalendarClock,
  ListChecks,
  AlertTriangle,
  CheckCircle2,
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
import { MarketingSection } from "@/components/MarketingSection";
import { ProjectWizard } from "@/components/ProjetosSection";
import { PageContainer } from "@/components/shared/PageContainer";
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
  deleteProjeto,
  type FeatureKey,
  type Project,
  type ProjectLayout,
  type Task,
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
import {
  tarefasSemFase,
  faseAtual,
  faseStatusEfetivo,
  type ProjetoFase,
} from "@/lib/roadmap-engine";
import { OPEN_STATUSES } from "@/lib/score";
import { formatIsoDate } from "@/lib/utils";
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

  // Resumo operacional do cabeçalho — derivado do Roadmap (fase atual,
  // responsável, próxima entrega, progresso) quando a funcionalidade está
  // habilitada; nunca inventado quando não há fases/roadmap, só omitido.
  const hasRoadmap = !!project?.features.includes("roadmap");
  const [fasesForHeader, setFasesForHeader] = useState<ProjetoFase[]>(() =>
    id ? loadProjetoFases(id) : [],
  );
  useEffect(() => {
    if (!hasRoadmap) return;
    setFasesForHeader(loadProjetoFases(id));
    return onProjetoFasesChange(() => setFasesForHeader(loadProjetoFases(id)));
  }, [id, hasRoadmap]);

  const [editOpen, setEditOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const requestDelete = async () => {
    if (!project) return;
    if (
      !(await confirm(
        `Excluir "${project.name}"? Isso remove o projeto e todo o conteúdo dele (tarefas, arquivos, roadmap). Não pode ser desfeito.`,
      ))
    ) {
      return;
    }
    deleteProjeto(project.id);
    navigate({ to: "/time", search: { section: "projetos" } });
  };

  if (!project) {
    return (
      <AppShell active="projetos" onSelect={goToSection}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">Projeto não encontrado.</p>
          <button
            type="button"
            onClick={() => void navigate({ to: "/time", search: { section: "projetos" } })}
            className="text-sm font-medium text-brand hover:underline"
          >
            Voltar para Projetos
          </button>
        </div>
      </AppShell>
    );
  }

  const projectTasks = project.tasks as unknown as BoardTask[];
  const pendentes = projectTasks.filter((t) => OPEN_STATUSES.has(t.status)).length;
  const faseAtualDoProjeto = hasRoadmap ? faseAtual(fasesForHeader, projectTasks) : null;
  const todasFasesConcluidas = hasRoadmap && fasesForHeader.length > 0 && !faseAtualDoProjeto;
  const fasesEmRiscoCount = hasRoadmap
    ? fasesForHeader.filter((f) => {
        const s = faseStatusEfetivo(f, projectTasks);
        return s === "em_risco" || s === "atrasada";
      }).length
    : 0;
  const proximaEntregaTask =
    projectTasks
      .filter((t) => OPEN_STATUSES.has(t.status) && t.dueDate)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0] ?? null;

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
      <PageContainer className="space-y-6">
        {/* Cabeçalho azul compacto (~140-170px no desktop) — identidade do
         * projeto + resumo operacional (fase atual/responsável/próxima
         * entrega/progresso, derivados do Roadmap quando habilitado, nunca
         * inventados) + ações. Breadcrumb embutido, substitui o antigo nav
         * isolado. */}
        <header className="overflow-hidden rounded-2xl bg-brand">
          <div className="flex flex-col gap-4 px-5 py-5 md:px-7 md:py-6">
            <nav
              aria-label="Navegação"
              className="flex items-center gap-1.5 text-xs text-brand-foreground-secondary"
            >
              <button
                type="button"
                onClick={() => goToSection("projetos")}
                className="rounded hover:text-brand-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-foreground/40"
              >
                Projetos
              </button>
              <span>/</span>
              <span className="min-w-0 truncate font-medium text-brand-foreground">
                {project.name}
              </span>
            </nav>

            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/10 ring-1 ring-brand-foreground/15 md:h-[72px] md:w-[72px]">
                  {project.cover ? (
                    <img
                      src={project.cover}
                      alt=""
                      className="h-full w-full object-cover object-center"
                    />
                  ) : (
                    <ImageIcon
                      className="h-6 w-6 text-brand-foreground-secondary"
                      strokeWidth={1.5}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-2xl font-semibold tracking-tight text-brand-foreground">
                    {project.name}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-foreground-secondary">
                    {project.description && (
                      <span className="max-w-[280px] truncate">{project.description}</span>
                    )}
                    {faseAtualDoProjeto ? (
                      <span className="inline-flex items-center gap-1">
                        <Flag className="h-3 w-3" /> {faseAtualDoProjeto.nome}
                      </span>
                    ) : todasFasesConcluidas ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Projeto concluído
                      </span>
                    ) : null}
                    {faseAtualDoProjeto?.responsavelPrincipal && (
                      <span>{faseAtualDoProjeto.responsavelPrincipal}</span>
                    )}
                    {proximaEntregaTask?.dueDate && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        Próxima entrega {formatIsoDate(proximaEntregaTask.dueDate)}
                      </span>
                    )}
                    {pendentes > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <ListChecks className="h-3 w-3" /> {pendentes}{" "}
                        {pendentes === 1 ? "tarefa pendente" : "tarefas pendentes"}
                      </span>
                    )}
                    {fasesEmRiscoCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 font-medium text-brand-foreground">
                        <AlertTriangle className="h-3 w-3" /> {fasesEmRiscoCount}{" "}
                        {fasesEmRiscoCount === 1 ? "fase em risco" : "fases em risco"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 self-start md:self-center">
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-brand-foreground/25 px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-black/10"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Mais opções"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-brand-foreground hover:bg-black/10"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => void requestDelete()}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir projeto
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>

        {editOpen && (
          <ProjectWizard
            initial={project}
            onClose={() => setEditOpen(false)}
            onSave={(p) => {
              update(p);
              setEditOpen(false);
            }}
          />
        )}
        {confirmDialog}

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
                              ? "border-brand text-brand"
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
      </PageContainer>
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

  // Dialog de tarefa unificado — edita (fase, "sem fase" ou Kanban) e
  // cria (dentro de uma fase) usando SEMPRE o mesmo SharedTaskDialog.
  const [taskDialog, setTaskDialog] = useState<
    { mode: "edit"; taskId: string } | { mode: "new"; defaultFaseId?: string } | null
  >(null);

  const saveTaskUnified = (t: Task) => {
    const tasks = project.tasks.some((x) => x.id === t.id)
      ? project.tasks.map((x) => (x.id === t.id ? t : x))
      : [...project.tasks, t];
    update({ tasks });
  };

  const deleteTaskUnified = (taskId: string) => {
    update({ tasks: project.tasks.filter((t) => t.id !== taskId) });
  };

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
      <RoadmapOverviewTab fases={fases} tasks={project.tasks as unknown as BoardTask[]} />

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
        update({ tasks: next as unknown as Task[] });
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
          className="rounded-md bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover"
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
    <div
      role="button"
      tabIndex={0}
      onClick={() => window.open(doc.url, "_blank", "noopener,noreferrer")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.open(doc.url, "_blank", "noopener,noreferrer");
        }
      }}
      className="group flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <SourceIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {doc.isPinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
          <span title={doc.name} className="min-w-0 truncate text-sm text-foreground">
            {doc.name}
          </span>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {sourceLabel} · {DOC_CATEGORY_LABEL[category]}
        </p>
      </div>
      {copied && <span className="shrink-0 text-[11px] text-muted-foreground">Copiado!</span>}
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
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
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <X className="h-3.5 w-3.5" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<DocCategory | "todas">("todas");
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
  const sortedDocs = [...project.docs]
    .filter((d) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q || d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q);
      const matchesCategory =
        categoryFilter === "todas" || (d.category ?? "outro") === categoryFilter;
      return matchesQuery && matchesCategory;
    })
    .sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Arquivos e links</h2>
          <span className="text-xs text-muted-foreground">({project.docs.length})</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar"
              className="h-8 w-36 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand sm:w-44"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as DocCategory | "todas")}
            aria-label="Filtrar por categoria"
            className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <option value="todas">Todas as categorias</option>
            {(Object.keys(DOC_CATEGORY_LABEL) as DocCategory[]).map((c) => (
              <option key={c} value={c}>
                {DOC_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <Popover
            open={addOpen}
            onOpenChange={(o) => {
              setAddOpen(o);
              if (!o) setAddStep("choose");
            }}
          >
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover">
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
      </div>

      {project.docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-xs text-muted-foreground">
            Nenhum material adicionado ainda. Adicione links importantes deste projeto.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-2 text-xs font-medium text-brand hover:underline"
          >
            Adicionar primeiro material
          </button>
        </div>
      ) : sortedDocs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum resultado para esta busca/filtro.</p>
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
        <button className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover">
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
