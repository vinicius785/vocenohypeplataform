import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Search,
  Upload,
  X,
  ImageIcon,
  Check,
  LayoutList,
  LayoutPanelTop,
  ChevronDown,
  FolderKanban,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {
  FEATURES,
  DEFAULT_FEATURES,
  INFLUENCER_FIELDS,
  DEFAULT_INFLUENCER_FIELDS,
  PROJECT_STATUS_LABEL,
  DEFAULT_PROJECT_STATUS,
  loadProjetos,
  loadTeamMembers,
  onProjetosChange,
  isProjetosLoaded,
  saveProjetos,
  deleteProjeto,
  duplicateProjeto,
  setProjetoStatus,
  touchProjeto,
  upsertProjeto,
  type FeatureKey,
  type InfluencerFieldKey,
  type Project,
  type ProjectLayout,
  type ProjectStatus,
} from "@/lib/projetos";
import { hasPermission, useMyAccess } from "@/lib/permissions";
import { initialsOf } from "@/components/metas/metas-ui-utils";
import { ProjectCard } from "./projetos/ProjectCard";
import { ProjetoFiltersBar } from "./projetos/ProjetoFiltersBar";
import {
  FEATURE_ICONS,
  computeProjectMetrics,
  filterProjects,
  sortProjects,
  isEncerrado,
  DEFAULT_PROJECT_FILTERS,
  type ProjectFiltersState,
} from "./projetos/projeto-ui";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useConfirm } from "@/hooks/use-confirm";

export function ProjetosSection() {
  const navigate = useNavigate();
  const access = useMyAccess();
  const canEdit = hasPermission(access, "projetos");
  const [items, setItemsState] = useState<Project[]>(() => loadProjetos());
  const [loaded, setLoaded] = useState(isProjetosLoaded());
  const setItems = (u: Project[] | ((p: Project[]) => Project[])) =>
    setItemsState((prev) => {
      const next = typeof u === "function" ? (u as (p: Project[]) => Project[])(prev) : u;
      saveProjetos(next);
      return next;
    });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ProjectFiltersState>(DEFAULT_PROJECT_FILTERS);
  const { confirm, confirmDialog } = useConfirm();

  useEffect(
    () =>
      onProjetosChange(() => {
        setItemsState(loadProjetos());
        setLoaded(isProjetosLoaded());
      }),
    [],
  );

  // `loadTeamMembers()` lê localStorage — barato o bastante pra não
  // precisar de memo próprio; só o mapa de métricas (que itera todas as
  // tarefas de todo projeto) é memoizado, e só por `items`.
  const metricsById = useMemo(() => {
    const team = loadTeamMembers();
    const map = new Map<string, ReturnType<typeof computeProjectMetrics>>();
    for (const p of items) map.set(p.id, computeProjectMetrics(p, team));
    return map;
  }, [items]);

  const responsaveis = useMemo(() => {
    const nomes = new Set<string>();
    for (const m of metricsById.values()) {
      if (m.principal) nomes.add(m.principal.name);
      for (const part of m.participantes) nomes.add(part.name);
    }
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [metricsById]);

  // Mesma estratégia de "Ver campanhas encerradas" do CampanhasSection:
  // com um status específico escolhido no filtro, tudo aparece junto na
  // grade principal (o filtro já deixa explícito o que se quer ver);
  // sem filtro de status, projetos concluídos/arquivados saem da grade
  // principal e vão pra uma seção recolhida ao final.
  const statusFilterActive = filters.status !== "todos";
  const filteredAll = useMemo(
    () => filterProjects(items, metricsById, query, filters),
    [items, metricsById, query, filters],
  );
  const [showEncerrados, setShowEncerrados] = useState(false);
  const encerradosAll = useMemo(
    () =>
      statusFilterActive
        ? []
        : filteredAll.filter((p) => isEncerrado(p.status ?? DEFAULT_PROJECT_STATUS)),
    [filteredAll, statusFilterActive],
  );
  const encerradosCount = encerradosAll.length;
  const visibleRows = useMemo(
    () =>
      sortProjects(
        statusFilterActive
          ? filteredAll
          : filteredAll.filter((p) => !isEncerrado(p.status ?? DEFAULT_PROJECT_STATUS)),
        metricsById,
        filters.sort,
      ),
    [filteredAll, statusFilterActive, metricsById, filters.sort],
  );
  const encerradosRows = useMemo(
    () => (showEncerrados ? sortProjects(encerradosAll, metricsById, filters.sort) : []),
    [showEncerrados, encerradosAll, metricsById, filters.sort],
  );

  const handleSave = (p: Project, isNew: boolean) => {
    setItems((prev) =>
      prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p],
    );
    setWizardOpen(false);
    setEditing(null);
    if (isNew) navigate({ to: "/projeto/$id", params: { id: p.id } });
  };

  const removeProject = async (p: Project) => {
    if (
      !(await confirm(
        `Excluir "${p.name}"? Isso remove o projeto e todo o conteúdo dele (tarefas, arquivos, roadmap). Não pode ser desfeito.`,
      ))
    ) {
      return;
    }
    setItemsState((prev) => prev.filter((x) => x.id !== p.id));
    deleteProjeto(p.id);
  };

  const handleDuplicate = (p: Project) => {
    const copy = duplicateProjeto(p);
    upsertProjeto(copy);
    setItemsState((prev) => [...prev, copy]);
    navigate({ to: "/projeto/$id", params: { id: copy.id } });
  };

  const handleSetStatus = (p: Project, status: ProjectStatus) => {
    setProjetoStatus(p.id, status);
    setItemsState((prev) => prev.map((x) => (x.id === p.id ? touchProjeto({ ...x, status }) : x)));
  };

  const handleArchive = async (p: Project) => {
    if (!(await confirm(`Arquivar "${p.name}"? Ele sai das listas ativas, mas nada é apagado.`))) {
      return;
    }
    handleSetStatus(p, "arquivado");
  };

  const hasAnyProject = items.length > 0;
  const hasResults = visibleRows.length > 0;
  const hasActiveFilters = query.trim().length > 0 || filters !== DEFAULT_PROJECT_FILTERS;
  const clearFilters = () => {
    setQuery("");
    setFilters(DEFAULT_PROJECT_FILTERS);
  };

  const ativosCount = items.filter((p) => (p.status ?? DEFAULT_PROJECT_STATUS) === "ativo").length;
  const totalCount = items.length;
  const emRiscoCount = Array.from(metricsById.values()).filter(
    (m) => m.health === "em_risco",
  ).length;
  const tarefasAtrasadasCount = Array.from(metricsById.values()).reduce(
    (s, m) => s + m.overdueCount,
    0,
  );

  const cardHandlers = (p: Project) => ({
    onOpen: () => navigate({ to: "/projeto/$id", params: { id: p.id } }),
    onEdit: () => {
      setEditing(p);
      setWizardOpen(true);
    },
    onDuplicate: () => handleDuplicate(p),
    onPause: () => handleSetStatus(p, "pausado"),
    onReactivate: () => handleSetStatus(p, "ativo"),
    onArchive: () => void handleArchive(p),
    onDelete: () => void removeProject(p),
  });

  return (
    // Canvas fix — mesma correção já usada em Campanhas/Clientes/Financeiro
    // (--background e --card são idênticos no tema claro, então sem isso
    // os cards não se distinguiam do fundo).
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
      <PageContainer className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[36px] font-bold leading-[1.05] tracking-tight text-foreground md:text-[42px]">
              Projetos
            </p>
            <p className="mt-1.5 text-sm text-text-secondary">
              Organize tarefas, fases e entregas do time.
            </p>
          </div>
          {canEdit && (
            <Button
              variant="primary"
              size="comfortable"
              onClick={() => {
                setEditing(null);
                setWizardOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo projeto
            </Button>
          )}
        </div>

        {hasAnyProject && (
          <div className="rounded-[24px] bg-brand p-5 dark:shadow-none md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <div className="shrink-0">
                <span className="inline-flex items-center rounded-full bg-black/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-foreground">
                  Projetos ativos
                </span>
                <p className="mt-2 whitespace-nowrap text-[40px] font-bold leading-none tracking-tight text-brand-foreground sm:text-[46px] md:text-[52px]">
                  {ativosCount}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-7 gap-y-3 lg:justify-end">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
                    <FolderKanban className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                      Total de projetos
                    </p>
                    <p className="whitespace-nowrap text-base font-bold leading-none text-brand-foreground">
                      {totalCount}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                      Em risco
                    </p>
                    <p className="whitespace-nowrap text-base font-bold leading-none text-brand-foreground">
                      {emRiscoCount}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
                    <Clock className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                      Tarefas atrasadas
                    </p>
                    <p className="whitespace-nowrap text-base font-bold leading-none text-brand-foreground">
                      {tarefasAtrasadasCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {hasAnyProject && (
          <ProjetoFiltersBar
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            responsaveis={responsaveis}
          />
        )}

        {!loaded ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[124px] animate-pulse rounded-[20px] border border-transparent bg-card"
              />
            ))}
          </div>
        ) : !hasAnyProject ? (
          <EmptyState
            icon={<FolderKanban className="h-5 w-5" />}
            title="Nenhum projeto cadastrado ainda"
            description="Crie o primeiro projeto para organizar tarefas, fases e entregas do time."
            primaryAction={
              canEdit
                ? {
                    label: "Novo projeto",
                    onClick: () => {
                      setEditing(null);
                      setWizardOpen(true);
                    },
                  }
                : undefined
            }
          />
        ) : !hasResults ? (
          <EmptyState
            icon={<FolderKanban className="h-5 w-5" />}
            title="Nenhum projeto encontrado"
            description="Ajuste a busca ou os filtros para ver outros projetos."
            secondaryAction={
              hasActiveFilters ? { label: "Limpar filtros", onClick: clearFilters } : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleRows.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                metrics={metricsById.get(p.id)!}
                canEdit={canEdit}
                {...cardHandlers(p)}
              />
            ))}
          </div>
        )}

        {encerradosCount > 0 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setShowEncerrados((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium text-brand hover:underline"
            >
              {showEncerrados
                ? "Ocultar projetos encerrados"
                : `Ver projetos encerrados (${encerradosCount})`}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showEncerrados ? "rotate-180" : ""}`}
              />
            </button>

            {showEncerrados && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {encerradosRows.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    metrics={metricsById.get(p.id)!}
                    canEdit={canEdit}
                    neutral
                    {...cardHandlers(p)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {wizardOpen && (
          <ProjectWizard
            initial={editing}
            onClose={() => {
              setWizardOpen(false);
              setEditing(null);
            }}
            onSave={handleSave}
          />
        )}
        {confirmDialog}
      </PageContainer>
    </div>
  );
}

/* ============================================================
 * Wizard de criação/edição — 4 etapas (identidade, funcionalidades,
 * influenciadores [condicional], navegação e revisão). Substitui o
 * antigo formulário único e longo — mesmo padrão de `Sheet` com
 * cabeçalho/stepper fixos + conteúdo rolável + rodapé fixo já usado em
 * `VincularCampanhaDialog.tsx`.
 * ============================================================ */

type WizardStepKey = "identidade" | "funcionalidades" | "influenciadores" | "navegacao";

export function ProjectWizard({
  initial,
  onClose,
  onSave,
}: {
  initial: Project | null;
  onClose: () => void;
  onSave: (p: Project, isNew: boolean) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [cover, setCover] = useState<string | undefined>(initial?.cover);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [features, setFeatures] = useState<FeatureKey[]>(initial?.features ?? DEFAULT_FEATURES);
  const [infFeatures, setInfFeatures] = useState<InfluencerFieldKey[]>(
    initial?.influencerFeatures ?? DEFAULT_INFLUENCER_FIELDS,
  );
  const [layout, setLayout] = useState<ProjectLayout>(initial?.layout ?? "tabs");
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? DEFAULT_PROJECT_STATUS);
  const [featureQuery, setFeatureQuery] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState<WizardStepKey>("identidade");
  const [maxVisitedIndex, setMaxVisitedIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const { confirm, confirmDialog } = useConfirm();

  const steps = useMemo(() => {
    const list: { key: WizardStepKey; label: string }[] = [
      { key: "identidade", label: "Identidade" },
      { key: "funcionalidades", label: "Funcionalidades" },
    ];
    if (features.includes("influenciadores")) {
      list.push({ key: "influenciadores", label: "Influenciadores" });
    }
    list.push({ key: "navegacao", label: "Navegação" });
    return list;
  }, [features]);
  const stepIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === step),
  );

  // Se "Influenciadores" for desmarcado enquanto essa etapa está aberta
  // (ou fechado o passo deixa de existir), volta pra uma etapa válida em
  // vez de ficar numa aba fantasma.
  useEffect(() => {
    if (!steps.some((s) => s.key === step)) {
      setStep(steps[Math.min(stepIndex, steps.length - 1)]?.key ?? "identidade");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

  const toggleFeature = (f: FeatureKey) =>
    setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  const toggleInfFeature = (f: InfluencerFieldKey) =>
    setInfFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  const snapshotKey = (v: {
    name: string;
    description: string;
    cover?: string;
    features: FeatureKey[];
    infFeatures: InfluencerFieldKey[];
    layout: ProjectLayout;
    status: ProjectStatus;
  }) => JSON.stringify(v);
  const baselineRef = useRef(
    snapshotKey({
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      cover: initial?.cover,
      features: initial?.features ?? DEFAULT_FEATURES,
      infFeatures: initial?.influencerFeatures ?? DEFAULT_INFLUENCER_FIELDS,
      layout: initial?.layout ?? "tabs",
      status: initial?.status ?? DEFAULT_PROJECT_STATUS,
    }),
  );
  const isDirty = () =>
    snapshotKey({ name, description, cover, features, infFeatures, layout, status }) !==
    baselineRef.current;

  const requestClose = async () => {
    if (isDirty()) {
      const ok = await confirm("Descartar as alterações não salvas neste projeto?");
      if (!ok) return;
    }
    onClose();
  };

  const handleCoverFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxWidth = 1600;
        const maxHeight = 900;
        const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          setError("Não foi possível processar a capa.");
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setCover(canvas.toDataURL("image/jpeg", 0.78));
        setError("");
      };
      image.onerror = () => setError("Imagem de capa inválida.");
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const validateStep = (key: WizardStepKey): string | null => {
    if (key === "identidade" && !name.trim()) return "Nome é obrigatório.";
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    const next = Math.min(stepIndex + 1, steps.length - 1);
    setStep(steps[next].key);
    setMaxVisitedIndex((m) => Math.max(m, next));
  };

  const goToStep = (i: number) => {
    if (i > maxVisitedIndex) return;
    setStep(steps[i].key);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateStep("identidade");
    if (err) {
      setStep("identidade");
      setError(err);
      return;
    }
    const isNew = !initial;
    onSave(
      {
        ...initial,
        id: initial?.id ?? crypto.randomUUID(),
        name: name.trim(),
        cover,
        description: description.trim(),
        features,
        influencerFeatures: features.includes("influenciadores") ? infFeatures : [],
        layout,
        status,
        updatedAt: Date.now(),
        createdAt: initial?.createdAt ?? Date.now(),
        milestones: initial?.milestones ?? [],
        tasks: initial?.tasks ?? [],
        docs: initial?.docs ?? [],
      },
      isNew,
    );
  };

  const filteredFeatures = FEATURES.filter(
    (f) =>
      !featureQuery.trim() || f.label.toLowerCase().includes(featureQuery.trim().toLowerCase()),
  );

  return (
    <>
      <Sheet open onOpenChange={(v) => !v && void requestClose()}>
        <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <div className="border-b border-border/60 px-6 py-5 sm:px-8">
            <SheetTitle>{initial ? "Editar projeto" : "Novo projeto"}</SheetTitle>
            <SheetDescription>
              Um projeto é um workspace configurável — só as funcionalidades escolhidas aqui
              aparecem dentro dele.
            </SheetDescription>
          </div>

          {/* Stepper completo — desktop/tablet */}
          <div className="hidden border-b border-border/60 px-6 pb-6 sm:block sm:px-8">
            <div className="flex items-center pt-1">
              {steps.map((s, i) => {
                const active = i === stepIndex;
                const done = i < stepIndex;
                const isLast = i === steps.length - 1;
                const reachable = i <= maxVisitedIndex;
                return (
                  <div key={s.key} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
                    <button
                      type="button"
                      onClick={() => goToStep(i)}
                      disabled={!reachable}
                      aria-label={s.label}
                      aria-current={active ? "step" : undefined}
                      title={s.label}
                      className="group flex shrink-0 flex-col items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                          active
                            ? "bg-brand text-brand-foreground"
                            : done
                              ? "bg-brand/20 text-brand"
                              : "bg-muted text-muted-foreground group-enabled:group-hover:bg-muted-foreground/20"
                        }`}
                      >
                        {done ? <Check className="h-4 w-4" /> : i + 1}
                      </span>
                      <span
                        className={`hidden w-24 text-center text-[11px] font-medium leading-tight md:block ${
                          active ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {s.label}
                      </span>
                    </button>
                    {!isLast && (
                      <div
                        className={`mx-2 h-px flex-1 transition-colors ${done ? "bg-brand" : "bg-border"}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Compacto — mobile */}
          <div className="border-b border-border/60 px-6 py-3 sm:hidden">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                {stepIndex + 1}. {steps[stepIndex]?.label}
              </span>
              <span className="text-muted-foreground">
                {stepIndex + 1} de {steps.length}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 sm:px-8">
              {step === "identidade" && (
                <div className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Capa
                    </label>
                    {/* Compacto e horizontal — nunca ocupando metade da tela. */}
                    <div
                      ref={dragRef}
                      onDragOver={(e) => {
                        e.preventDefault();
                        dragRef.current?.classList.add("ring-2", "ring-brand");
                      }}
                      onDragLeave={() => dragRef.current?.classList.remove("ring-2", "ring-brand")}
                      onDrop={(e) => {
                        e.preventDefault();
                        dragRef.current?.classList.remove("ring-2", "ring-brand");
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleCoverFile(f);
                      }}
                      className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                        {cover ? (
                          <img src={cover} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          Arraste uma imagem ou anexe um arquivo. Proporção 16:9.
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              e.target.files?.[0] && handleCoverFile(e.target.files[0])
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileRef.current?.click()}
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {cover ? "Trocar capa" : "Anexar capa"}
                          </Button>
                          {cover && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setCover(undefined)}
                            >
                              <X className="h-3.5 w-3.5" /> Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Nome
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex.: Lançamento verão 2026"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-brand"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Descrição
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Sobre o que é este projeto?"
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-brand"
                    />
                  </div>
                  {/* Status só aparece ao editar — um projeto novo sempre
                   * começa "ativo", sem fricção extra na criação. */}
                  {initial && (
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Status
                      </label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {PROJECT_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {step === "funcionalidades" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Escolha o que este projeto precisa. Cada uma vira uma seção dentro dele.
                    </p>
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                      {features.length} selecionada{features.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {FEATURES.length > 6 && (
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={featureQuery}
                        onChange={(e) => setFeatureQuery(e.target.value)}
                        placeholder="Buscar funcionalidade"
                        className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      />
                    </div>
                  )}

                  {(["core", "marketing"] as const).map((group) => {
                    const groupItems = filteredFeatures.filter(
                      (f) => (f.group ?? "core") === group,
                    );
                    if (groupItems.length === 0) return null;
                    return (
                      <div key={group}>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {group === "core" ? "Essenciais" : "Marketing"}
                          </span>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {groupItems.map((f) => {
                            const checked = features.includes(f.key);
                            const Icon = FEATURE_ICONS[f.key];
                            return (
                              <button
                                type="button"
                                key={f.key}
                                onClick={() => toggleFeature(f.key)}
                                aria-pressed={checked}
                                className={`group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                                  checked
                                    ? "border-brand bg-brand-subtle/40"
                                    : "border-border bg-background hover:border-foreground/40 hover:bg-muted/40"
                                }`}
                              >
                                <span
                                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                                    checked
                                      ? "border-brand bg-background text-brand"
                                      : "border-border bg-muted/50 text-muted-foreground"
                                  }`}
                                >
                                  <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-foreground">
                                      {f.label}
                                    </span>
                                    <span
                                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                        checked
                                          ? "border-brand bg-brand text-brand-foreground"
                                          : "border-border"
                                      }`}
                                    >
                                      {checked && <Check className="h-3 w-3" />}
                                    </span>
                                  </span>
                                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                                    {f.hint}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {step === "influenciadores" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Esses itens determinam quais campos vão estar disponíveis no cadastro de cada
                    influenciador dentro deste projeto.
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {INFLUENCER_FIELDS.map((sf) => {
                      const checked = infFeatures.includes(sf.key);
                      return (
                        <button
                          type="button"
                          key={sf.key}
                          onClick={() => toggleInfFeature(sf.key)}
                          className={`flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                            checked
                              ? "border-brand bg-brand-subtle/40"
                              : "border-border bg-background hover:bg-muted/40"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block font-medium text-foreground">{sf.label}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {sf.hint}
                            </span>
                          </span>
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked
                                ? "border-brand bg-brand text-brand-foreground"
                                : "border-border"
                            }`}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === "navegacao" && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Como o time vai navegar pelas seções dentro do projeto.
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(
                        [
                          {
                            key: "tabs",
                            label: "Em abas",
                            hint: "Uma funcionalidade por vez, foco em um único contexto.",
                            Icon: LayoutPanelTop,
                          },
                          {
                            key: "single",
                            label: "Página única",
                            hint: "Todas as funcionalidades empilhadas em uma rolagem só.",
                            Icon: LayoutList,
                          },
                        ] as const
                      ).map((opt) => {
                        const checked = layout === opt.key;
                        const Icon = opt.Icon;
                        return (
                          <button
                            type="button"
                            key={opt.key}
                            onClick={() => setLayout(opt.key)}
                            className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                              checked
                                ? "border-brand bg-brand-subtle/40"
                                : "border-border bg-background hover:border-foreground/40 hover:bg-muted/40"
                            }`}
                          >
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                                checked
                                  ? "border-brand bg-background text-brand"
                                  : "border-border bg-muted/50 text-muted-foreground"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  {opt.label}
                                </span>
                                <span
                                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                    checked
                                      ? "border-brand bg-brand text-brand-foreground"
                                      : "border-border"
                                  }`}
                                >
                                  {checked && <Check className="h-3 w-3" />}
                                </span>
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                                {opt.hint}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Revisão
                    </p>
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                        {cover ? (
                          <img src={cover} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-muted-foreground/60">
                            {initialsOf(name || "P")}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {name || "Sem nome"}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {features.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              Nenhuma funcionalidade selecionada
                            </span>
                          ) : (
                            features.map((f) => (
                              <Badge key={f} variant="secondary" className="font-normal">
                                {FEATURES.find((x) => x.key === f)?.label ?? f}
                              </Badge>
                            ))
                          )}
                        </div>
                        {features.includes("influenciadores") && (
                          <p className="text-xs text-muted-foreground">
                            Influenciadores: {infFeatures.length} campo
                            {infFeatures.length === 1 ? "" : "s"} configurado
                            {infFeatures.length === 1 ? "" : "s"}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Navegação: {layout === "tabs" ? "Em abas" : "Página única"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-4 sm:px-8">
              <Button type="button" variant="ghost" onClick={() => void requestClose()}>
                Cancelar
              </Button>
              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(steps[stepIndex - 1].key)}
                  >
                    Voltar
                  </Button>
                )}
                {stepIndex < steps.length - 1 ? (
                  <Button type="button" variant="primary" onClick={goNext}>
                    Próximo
                  </Button>
                ) : (
                  <Button type="submit" variant="primary">
                    {initial ? "Salvar alterações" : "Criar projeto"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  );
}
