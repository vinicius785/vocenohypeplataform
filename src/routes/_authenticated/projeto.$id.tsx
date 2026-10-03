import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DateField } from "@/components/ui/date-field";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Plus,
  X,
  FileText,
  ImageIcon,
  ExternalLink,
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
  Pause,
  Play,
  Archive,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
  type DocItem,
  type DocSourceType,
  type DocCategory,
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
} from "@/lib/projeto-scoped-store";
import { formatIsoDate } from "@/lib/utils";
import { NativeSelect } from "@/components/ui/native-select";

export const Route = createFileRoute("/_authenticated/projeto/$id")({
  component: ProjetoPage,
  validateSearch: (search: Record<string, unknown>): { taskId?: string } => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
  head: ({ params }) => ({ meta: [{ title: `Projeto · ${params.id.slice(0, 6)}` }] }),
});

/** Rótulos curtos da navegação por âncora e títulos de seção — Projeto é UMA
 * página; cada área é uma seção dela (nada de abas trocando o conteúdo). */
const SECTION_NAV_LABEL: Record<FeatureKey, string> = {
  kanban: "Tarefas",
  influenciadores: "Influenciadores",
  documentos: "Arquivos",
  calendario_editorial: "Calendário",
  trafego_pago: "Tráfego",
  blog: "Blog",
  aeo_monitor: "AEO",
  bugs_sugestoes: "Bugs",
  fluxos_email: "E-mails",
};
const SECTION_TITLE: Record<FeatureKey, string> = {
  kanban: "Tarefas",
  influenciadores: "Influenciadores",
  documentos: "Arquivos e links",
  calendario_editorial: "Calendário editorial",
  trafego_pago: "Tráfego pago",
  blog: "Blog",
  aeo_monitor: "AEO Monitor",
  bugs_sugestoes: "Bugs & Sugestões",
  fluxos_email: "E-mails",
};

/** Monta o conteúdo só quando a seção chega perto da tela (uma vez) — a
 * página mostra TODAS as seções, mas não carrega Blog/AEO/e-mails etc. de
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
    <section id={id} className="scroll-mt-14 border-t border-border/60 pt-8">
      <p role="heading" aria-level={2} className={`${TYPOGRAPHY.sectionTitle} mb-5`}>
        {title}
      </p>
      {eager ? children : <LazyMount>{children}</LazyMount>}
    </section>
  );
}

/** Navegação por âncora (scroll suave) — fixa no topo enquanto se rola, com
 * a seção visível destacada. Não troca a página nem esconde nenhuma área. */
function ProjectSectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join("|")]);

  if (items.length < 3) return null;
  return (
    <nav
      aria-label="Seções do projeto"
      className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-border/60 bg-background/90 px-4 backdrop-blur [scrollbar-width:none] md:-mx-8 md:px-8 [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex gap-5">
        {items.map((it) => (
          <li key={it.id} className="shrink-0">
            <button
              type="button"
              aria-current={active === it.id ? "true" : undefined}
              onClick={() =>
                document
                  .getElementById(it.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className={`border-b-2 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                active === it.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-text-secondary hover:text-foreground"
              }`}
            >
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function renderPanel(
  k: FeatureKey,
  project: Project,
  update: (p: Partial<Project>) => void,
  initialOpenTaskId?: string,
  onInitialOpenTaskHandled?: () => void,
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

            <div className="flex shrink-0 items-center gap-2 self-start">
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

        {availableSections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma funcionalidade habilitada para este projeto.
          </p>
        ) : (
          <>
            <ProjectSectionNav
              items={[
                { id: "resumo", label: "Resumo" },
                ...availableSections.map((k) => ({
                  id: `secao-${k}`,
                  label: SECTION_NAV_LABEL[k],
                })),
              ]}
            />
            <div className="space-y-12">
              {availableSections.map((k, i) => (
                <ProjectSection
                  key={k}
                  id={`secao-${k}`}
                  title={SECTION_TITLE[k]}
                  eager={i === 0 || k === "kanban"}
                >
                  {renderPanel(k, project, update, taskId, clearTaskId)}
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
        <NativeSelect
          value={category}
          onChange={(e) => setCategory(e.target.value as DocCategory)}
          className="w-full"
        >
          {DOC_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {DOC_CATEGORY_LABEL[c]}
            </option>
          ))}
        </NativeSelect>
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
    if (
      !(await confirm(`Você está prestes a excluir "${name}".\nEsta ação não pode ser desfeita.`, {
        title: "Excluir item?",
        confirmLabel: "Excluir",
        destructive: true,
      }))
    )
      return;
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
        <p className="text-sm text-text-secondary">
          {project.docs.length} {project.docs.length === 1 ? "item" : "itens"}
        </p>
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
          <NativeSelect
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as DocCategory | "todas")}
            aria-label="Filtrar por categoria"
          >
            <option value="todas">Todas as categorias</option>
            {(Object.keys(DOC_CATEGORY_LABEL) as DocCategory[]).map((c) => (
              <option key={c} value={c}>
                {DOC_CATEGORY_LABEL[c]}
              </option>
            ))}
          </NativeSelect>
          <Popover
            open={addOpen}
            onOpenChange={(o) => {
              setAddOpen(o);
              if (!o) setAddStep("choose");
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="primary" size="sm">
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
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
            className="mt-2 text-xs font-medium text-text-brand hover:underline"
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
