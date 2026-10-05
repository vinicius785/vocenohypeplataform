import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DateField } from "@/components/ui/date-field";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Plus,
  X,
  ImageIcon,
  ExternalLink,
  Copy,
  MoreHorizontal,
  Pencil,
  Trash2,
  Pause,
  Play,
  Archive,
  ArrowLeft,
  ChevronDown,
  FolderOpen,
  Newspaper,
  Radar,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { KpiCell, KpiStrip } from "@/components/shared/Kpi";
import { useConfirm } from "@/hooks/use-confirm";
import { useMyAccess, hasPermission } from "@/lib/permissions";
import { AppShell, type SectionKey } from "@/components/AppShell";
import { MarketingSection } from "@/components/MarketingSection";
import { ProjectWizard } from "@/components/ProjetosSection";
import { PageContainer } from "@/components/shared/PageContainer";
import { ProjectBugsPanel } from "@/components/projetos/ProjectBugsPanel";
import { TaskBoard, type Task as BoardTask } from "@/components/tasks/TaskBoard";
import {
  FEATURES,
  getProjeto,
  onProjetosChange,
  upsertProjeto,
  deleteProjeto,
  duplicateProjeto,
  setProjetoStatus,
  loadTeamMembers,
  PROJECT_STATUS_LABEL,
  type FeatureKey,
  type Project,
  type ProjectStatus,
  type Task,
  type SectionItem,
} from "@/lib/projetos";
import {
  computeProjectMetrics,
  statusMenuActions,
  PROJECT_STATUS_BADGE_VARIANT,
  PROJECT_HEALTH_BADGE_VARIANT,
  PROJECT_HEALTH_LABEL,
} from "@/components/projetos/projeto-ui";
import { Badge } from "@/components/ui/badge";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { OPEN_STATUSES } from "@/lib/score";
import { BlogPanel } from "@/components/marketing/BlogPanel";
import { AeoMonitorPanel } from "@/components/marketing/AeoMonitorPanel";
import { normalizeInflus, type Influ } from "@/lib/influencer-model";
import { InfluencerBoard } from "@/components/influenciadores/InfluencerBoard";
import {
  loadProjetoInflus,
  saveProjetoInflus,
  onProjetoInflusChange,
  saveProjetoTarefas,
} from "@/lib/projeto-scoped-store";
import { formatIsoDate } from "@/lib/utils";

import {
  ProjectDocumentsDialog,
  ProjectDocumentsPanel,
} from "@/components/projetos/ProjectDocuments";
import { KANBAN_COLUMN_LIMIT } from "@/lib/kanban-limit";

export const Route = createFileRoute("/_authenticated/projeto/$id")({
  component: ProjetoPage,
  validateSearch: (search: Record<string, unknown>): { taskId?: string } => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
  head: ({ params }) => ({ meta: [{ title: `Projeto · ${params.id.slice(0, 6)}` }] }),
});

/** Títulos de seção — Projeto é UMA página corrida: cada área é uma seção dela, uma abaixo da
 * outra, sem seletor de abas nem navegação por âncora. */
const SECTION_TITLE: Record<FeatureKey, string> = {
  kanban: "Tarefas",
  influenciadores: "Influenciadores",
  documentos: "Arquivos e links",
  blog: "Blog",
  aeo_monitor: "AEO Monitor",
  bugs_sugestoes: "Bugs & Sugestões",
};

/** Monta o conteúdo só quando a seção chega perto da tela (uma vez) — a
 * página mostra TODAS as seções, mas não carrega Blog/AEO etc. de
 * uma vez só (cada um busca seus próprios dados ao montar). */
function LazyMount({ children, minHeight = 160 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(
    () => typeof window === "undefined" || typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    if (shown || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return shown ? <>{children}</> : <div ref={ref} style={{ minHeight }} aria-hidden />;
}

function ProjectSection({
  id,
  title,
  eager,
  children,
}: {
  id: string;
  title: string;
  eager?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-14">
      <p role="heading" aria-level={2} className={`${TYPOGRAPHY.sectionTitle} mb-4`}>
        {title}
      </p>
      {eager ? children : <LazyMount>{children}</LazyMount>}
    </section>
  );
}

function renderPanel(
  k: FeatureKey,
  project: Project,
  update: (p: Partial<Project>) => void,
  initialOpenTaskId?: string,
  onInitialOpenTaskHandled?: () => void,
  blogEditingId?: string | null,
  onBlogEditingIdChange?: (id: string | null) => void,
) {
  const isMarketingProject = project.name.trim().toUpperCase() === "MARKETING";
  if (k === "kanban")
    return isMarketingProject ? (
      <MarketingSection
        embedded
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
  if (k === "documentos") return <ProjectDocumentsPanel project={project} update={update} />;
  if (k === "blog")
    return (
      <BlogPanel
        project={project}
        update={update}
        editingId={blogEditingId}
        onEditingIdChange={onBlogEditingIdChange}
      />
    );
  if (k === "aeo_monitor") return <AeoMonitorPanel />;
  if (k === "bugs_sugestoes") return <ProjectBugsPanel project={project} update={update} />;
  return <SectionPanel project={project} update={update} featureKey={k} />;
}

function ProjetoPage() {
  const [docsOpen, setDocsOpen] = useState(false);
  // Artigo do Blog em edição: a página mostra SÓ o editor (modo focado) até voltar para o Blog.
  const [blogEditingId, setBlogEditingId] = useState<string | null>(null);
  // Blog aberto por "Recursos": a página mostra só o Blog (lista e editor), não a página corrida.
  const [blogOpen, setBlogOpen] = useState(false);
  // AEO Monitor aberto por "Recursos": mesma ideia — a página mostra só o monitor.
  const [aeoOpen, setAeoOpen] = useState(false);
  const { id } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(() => getProjeto(id) ?? null);
  // Deep-link `?taskId=` (ex.: indicador global de timer ativo): leva à
  // seção Tarefas da MESMA página — o próprio board abre a tarefa.
  const prevTaskIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (taskId && taskId !== prevTaskIdRef.current && project?.features.includes("kanban")) {
      document.getElementById("secao-kanban")?.scrollIntoView({ block: "start" });
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

  const [editOpen, setEditOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const access = useMyAccess();
  const canEdit = hasPermission(access, "projetos");

  const requestDelete = async () => {
    if (!project) return;
    if (
      !(await confirm(
        `Você está prestes a excluir "${project.name}".\nTodas as tarefas e arquivos associados serão removidos.\nEsta ação não pode ser desfeita.`,
        { title: "Excluir projeto?", confirmLabel: "Excluir projeto", destructive: true },
      ))
    ) {
      return;
    }
    deleteProjeto(project.id);
    navigate({ to: "/time", search: { section: "projetos" } });
  };

  const handleDuplicateProject = () => {
    if (!project) return;
    const copy = duplicateProjeto(project);
    upsertProjeto(copy);
    navigate({ to: "/projeto/$id", params: { id: copy.id } });
  };

  const handleSetProjectStatus = (status: ProjectStatus) => {
    if (!project) return;
    setProjetoStatus(project.id, status);
  };

  const requestArchive = async () => {
    if (!project) return;
    if (
      !(await confirm(`"${project.name}" sai das listas ativas, mas nada é apagado.`, {
        title: "Arquivar projeto?",
        confirmLabel: "Arquivar",
      }))
    ) {
      return;
    }
    handleSetProjectStatus("arquivado");
  };

  if (!project) {
    return (
      <AppShell active="projetos" onSelect={goToSection}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">Projeto não encontrado.</p>
          <button
            type="button"
            onClick={() => void navigate({ to: "/time", search: { section: "projetos" } })}
            className="text-sm font-medium text-text-brand hover:underline"
          >
            Voltar para Projetos
          </button>
        </div>
      </AppShell>
    );
  }

  // Métricas do cabeçalho — mesma função central já usada na listagem de
  // Projetos (`computeProjectMetrics`), nunca uma segunda regra local só
  // pra esta tela.
  const projectStatus = project.status ?? "ativo";
  const metrics = computeProjectMetrics(project, loadTeamMembers());
  const { canPause, canReactivate, canArchive } = statusMenuActions(projectStatus);

  const projectTasks = project.tasks as unknown as BoardTask[];
  const proximaEntregaTask =
    projectTasks
      .filter((t) => OPEN_STATUSES.has(t.status) && t.dueDate)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0] ?? null;

  // "Pendências" do resumo — prioriza exceções reais, nunca mostra "0" de
  // propósito (item 4 do pedido: nada de traço solto/indicador zerado).
  const atrasadasLabel =
    metrics.overdueCount > 0
      ? `${metrics.overdueCount} ${metrics.overdueCount === 1 ? "tarefa atrasada" : "tarefas atrasadas"}`
      : null;
  const pendenciaValue = atrasadasLabel ?? "Nenhuma pendência crítica";
  const pendenciaComplemento: string | undefined = undefined;
  const temPendenciaCritica = !!atrasadasLabel;

  // Projeto "HypeApp" ganha a aba de Bugs & Sugestões automaticamente,
  // mesmo padrão de nome especial já usado pro projeto "MARKETING" — sem
  // precisar que alguém lembre de habilitar a feature manualmente.
  const isHypeAppProject = project.name.trim().toLowerCase() === "hypeapp";
  const featuresWithHypeApp =
    isHypeAppProject && !project.features.includes("bugs_sugestoes")
      ? [...project.features, "bugs_sugestoes" as const]
      : project.features;
  const availableSections = FEATURES.map((f) => f.key).filter((k) =>
    featuresWithHypeApp.includes(k),
  );
  // Documentos, Blog e AEO Monitor não são mais seções empilhadas: abrem pelo menu "Recursos" do cabeçalho,
  // como em Campanhas e no Comercial.
  const hasDocs = availableSections.includes("documentos");
  const hasBlog = availableSections.includes("blog");
  const hasAeo = availableSections.includes("aeo_monitor");
  const sections = availableSections.filter(
    (k) => k !== "documentos" && k !== "blog" && k !== "aeo_monitor",
  );

  if (aeoOpen) {
    return (
      <AppShell active="projetos" onSelect={goToSection}>
        <PageContainer variant="wide" className="space-y-6">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setAeoOpen(false)}
              className="inline-flex items-center gap-1 rounded-md text-xs text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {project.name}
            </button>
          </div>
          <AeoMonitorPanel />
        </PageContainer>
      </AppShell>
    );
  }

  if (blogOpen || (blogEditingId && project.blog?.some((b) => b.id === blogEditingId))) {
    return (
      <AppShell active="projetos" onSelect={goToSection}>
        <PageContainer variant="wide" className="space-y-6">
          <BlogPanel
            project={project}
            update={update}
            editingId={blogEditingId}
            onEditingIdChange={setBlogEditingId}
            onBack={() => {
              setBlogEditingId(null);
              setBlogOpen(false);
            }}
          />
        </PageContainer>
      </AppShell>
    );
  }

  return (
    <AppShell active="projetos" onSelect={goToSection}>
      <PageContainer className="space-y-6">
        {/* Breadcrumb — fora do cabeçalho, mesmo padrão da página de
         * Campanha (`CampanhaDetail`'s `<nav>`). */}
        <nav aria-label="Navegação" className="text-xs">
          <button
            type="button"
            onClick={() => goToSection("projetos")}
            className="inline-flex items-center gap-1 text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Projetos
          </button>
        </nav>

        {/* Cabeçalho — card escuro compacto, mesma linguagem visual da
         * página de Campanha: identidade em cima, resumo operacional
         * (SummaryStat, componente compartilhado) numa faixa só embaixo do
         * mesmo card. Nada de banner azul — azul fica só como destaque
         * (botão, foco, badges de saúde). */}
        <div id="resumo" className="scroll-mt-14 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                {project.cover ? (
                  <img
                    src={project.cover}
                    alt=""
                    className="h-full w-full object-cover object-center"
                  />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                    {project.name}
                  </h1>
                  <Badge variant={PROJECT_STATUS_BADGE_VARIANT[projectStatus]} className="shrink-0">
                    {PROJECT_STATUS_LABEL[projectStatus]}
                  </Badge>
                </div>
                {project.description && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {project.description}
                  </p>
                )}
                {metrics.principal && (
                  <p className="mt-1 truncate text-xs text-text-secondary">
                    {metrics.principal.name} · Atualizado {metrics.lastActivityLabel}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 self-start">
              {(hasDocs || hasBlog || hasAeo) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" aria-haspopup="menu">
                      Recursos
                      <ChevronDown className="h-3 w-3 text-text-secondary" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    {hasDocs && (
                      <DropdownMenuItem onSelect={() => setDocsOpen(true)}>
                        <FolderOpen className="h-3.5 w-3.5 text-text-secondary" />
                        <span className="min-w-0 flex-1 truncate">Documentos</span>
                        {project.docs.length > 0 && (
                          <span className="text-xs tabular-nums text-text-secondary">
                            {project.docs.length}
                          </span>
                        )}
                      </DropdownMenuItem>
                    )}
                    {hasAeo && (
                      <DropdownMenuItem onSelect={() => setAeoOpen(true)}>
                        <Radar className="h-3.5 w-3.5 text-text-secondary" />
                        <span className="min-w-0 flex-1 truncate">AEO Monitor</span>
                      </DropdownMenuItem>
                    )}
                    {hasBlog && (
                      <DropdownMenuItem onSelect={() => setBlogOpen(true)}>
                        <Newspaper className="h-3.5 w-3.5 text-text-secondary" />
                        <span className="min-w-0 flex-1 truncate">Blog</span>
                        {(project.blog?.length ?? 0) > 0 && (
                          <span className="text-xs tabular-nums text-text-secondary">
                            {project.blog?.length}
                          </span>
                        )}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Mais opções"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <>
                      <DropdownMenuItem onSelect={handleDuplicateProject}>
                        <Copy className="h-3.5 w-3.5" /> Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {canPause && (
                        <DropdownMenuItem onSelect={() => handleSetProjectStatus("pausado")}>
                          <Pause className="h-3.5 w-3.5" /> Pausar
                        </DropdownMenuItem>
                      )}
                      {canReactivate && (
                        <DropdownMenuItem onSelect={() => handleSetProjectStatus("ativo")}>
                          <Play className="h-3.5 w-3.5" /> Reativar
                        </DropdownMenuItem>
                      )}
                      {canArchive && (
                        <DropdownMenuItem onSelect={() => void requestArchive()}>
                          <Archive className="h-3.5 w-3.5" /> Arquivar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    onSelect={() => void requestDelete()}
                    className="text-destructive focus:text-destructive"
                    disabled={!canEdit}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir projeto
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Resumo operacional — uma faixa só, SummaryStat compartilhado
           * (mesmo componente do resumo de Campanha). */}
          <KpiStrip aria-label="Resumo do projeto">
            <KpiCell
              label="Progresso"
              value={metrics.total === 0 ? "Sem tarefas" : `${metrics.progressPct}%`}
              complement={
                metrics.total > 0 ? `${metrics.completed} de ${metrics.total} tarefas` : undefined
              }
            />
            <KpiCell
              label="Próxima entrega"
              value={proximaEntregaTask ? proximaEntregaTask.title : "Sem próxima entrega"}
              complement={
                proximaEntregaTask?.dueDate ? formatIsoDate(proximaEntregaTask.dueDate) : undefined
              }
            />
            <KpiCell
              label="Pendências"
              labelExtra={
                metrics.health &&
                metrics.health !== "saudavel" && (
                  <Badge
                    variant={PROJECT_HEALTH_BADGE_VARIANT[metrics.health]}
                    className="px-1.5 py-0 text-[11px]"
                  >
                    {PROJECT_HEALTH_LABEL[metrics.health]}
                  </Badge>
                )
              }
              value={pendenciaValue}
              complement={pendenciaComplemento}
              tone={temPendenciaCritica ? "danger" : undefined}
            />
          </KpiStrip>
        </div>

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

        {hasDocs && (
          <ProjectDocumentsDialog
            open={docsOpen}
            onOpenChange={setDocsOpen}
            project={project}
            update={update}
          />
        )}

        {availableSections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma funcionalidade habilitada para este projeto.
          </p>
        ) : (
          <>
            <div className="space-y-14">
              {sections.map((k, i) => (
                <ProjectSection
                  key={k}
                  id={`secao-${k}`}
                  title={SECTION_TITLE[k]}
                  eager={i === 0 || k === "kanban"}
                >
                  {renderPanel(
                    k,
                    project,
                    update,
                    taskId,
                    clearTaskId,
                    blogEditingId,
                    setBlogEditingId,
                  )}
                </ProjectSection>
              ))}
            </div>
          </>
        )}
      </PageContainer>
    </AppShell>
  );
}

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
  return (
    <TaskBoard
      tasks={project.tasks as unknown as BoardTask[]}
      onChange={(next) => {
        update({ tasks: next as unknown as Task[] });
      }}
      scope={{ kind: "projeto", id: project.id }}
      title=""
      breadcrumb="Projetos"
      columnLimit={KANBAN_COLUMN_LIMIT}
      initialOpenTaskId={initialOpenTaskId}
      onInitialOpenTaskHandled={onInitialOpenTaskHandled}
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
      hideTitle
    />
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
