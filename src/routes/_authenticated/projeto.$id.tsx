import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
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
  type SectionItem,
} from "@/lib/projetos";
import { EditorialPanel } from "@/components/marketing/EditorialPanel";
import { TrafegoPagoPanel } from "@/components/marketing/TrafegoPagoPanel";
import { BlogPanel } from "@/components/marketing/BlogPanel";
import { AeoMonitorPanel } from "@/components/marketing/AeoMonitorPanel";
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
} from "@/lib/projeto-scoped-store";

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
      <MarketingSection />
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
  if (k === "bugs_sugestoes") return <ProjectBugsPanel />;
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
  const availableTabs =
    isHypeAppProject && !project.features.includes("bugs_sugestoes")
      ? [...project.features, "bugs_sugestoes" as const]
      : project.features;

  return (
    <AppShell active="projetos" onSelect={goToSection}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <BackButton onClick={() => goToSection("projetos")} label="Projetos" />

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
                        <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
                        </div>
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
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const task: Task = {
      id: crypto.randomUUID(),
      title: title.trim(),
      status: "Aberto",
      dueDate: date || undefined,
    };
    const m: Milestone = {
      id: crypto.randomUUID(),
      title: title.trim(),
      date,
      done: false,
      taskId: task.id,
    };
    update({ milestones: [...project.milestones, m], tasks: [...project.tasks, task] });
    setTitle("");
    setDate("");
  };

  const remove = (id: string) => {
    const m = project.milestones.find((x) => x.id === id);
    update({
      milestones: project.milestones.filter((x) => x.id !== id),
      tasks: m?.taskId ? project.tasks.filter((t) => t.id !== m.taskId) : project.tasks,
    });
  };

  const openMilestone = (m: Milestone) => {
    let taskId = m.taskId;
    if (!taskId) {
      const t: Task = {
        id: crypto.randomUUID(),
        title: m.title,
        status: m.done ? "Concluído" : "Aberto",
        dueDate: m.date || undefined,
      };
      taskId = t.id;
      update({
        tasks: [...project.tasks, t],
        milestones: project.milestones.map((x) => (x.id === m.id ? { ...x, taskId } : x)),
      });
    }
    setOpenTaskId(taskId);
  };

  const saveTask = (t: Task) => {
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

  const sorted = useMemo(
    () => [...project.milestones].sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    [project.milestones],
  );

  const openTask = openTaskId ? (project.tasks.find((t) => t.id === openTaskId) ?? null) : null;

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Marco / entrega"
          className="h-8 flex-1 min-w-[200px] rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <button className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Adicionar marco
        </button>
      </form>

      {sorted.length === 0 ? (
        <EmptyState label="Nenhum marco ainda." />
      ) : (
        <div className="overflow-x-auto pb-4">
          <div
            className="relative min-w-full"
            style={{ minWidth: `${Math.max(sorted.length * 180, 600)}px` }}
          >
            {/* linha horizontal */}
            <div className="absolute left-0 right-0 top-6 h-px bg-border" />
            <ol className="relative flex items-start gap-4">
              {sorted.map((m) => (
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
                      <span className="text-xs font-semibold">{sorted.indexOf(m) + 1}</span>
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
                  <button
                    onClick={() => remove(m.id)}
                    aria-label="Remover"
                    className="absolute right-0 top-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {openTask && (
        <SharedTaskDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) setOpenTaskId(null);
          }}
          initial={openTask as unknown as BoardTask}
          scope={{ kind: "projeto", id: project.id }}
          breadcrumb="Projetos"
          onSave={(t) => saveTask(t as unknown as Task)}
          onDelete={() => {
            update({
              tasks: project.tasks.filter((t) => t.id !== openTask.id),
              milestones: project.milestones.map((m) =>
                m.taskId === openTask.id ? { ...m, taskId: undefined } : m,
              ),
            });
            setOpenTaskId(null);
          }}
        />
      )}
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

/* -------- Docs -------- */
function DocsPanel({
  project,
  update,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    const d: DocItem = { id: crypto.randomUUID(), name: name.trim(), url: url.trim() };
    update({ docs: [...project.docs, d] });
    setName("");
    setUrl("");
  };
  const remove = (id: string) => update({ docs: project.docs.filter((x) => x.id !== id) });

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do documento"
          className="h-8 flex-1 min-w-[180px] rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="h-8 flex-[2] min-w-[220px] rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <button className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </form>

      {project.docs.length === 0 ? (
        <EmptyState label="Nenhum documento ainda." />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-background">
          {project.docs.map((d) => (
            <li key={d.id} className="group flex items-center gap-3 px-3 py-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm text-foreground hover:underline"
              >
                {d.name}
              </a>
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir"
                className="rounded p-1 hover:bg-muted"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </a>
              <button
                onClick={() => remove(d.id)}
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
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
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
