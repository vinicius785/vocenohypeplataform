import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Upload, X, ImageIcon, ChevronDown, FolderKanban } from "lucide-react";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCell, KpiStrip } from "@/components/shared/Kpi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useConfirm } from "@/hooks/use-confirm";
import { NativeSelect } from "@/components/ui/native-select";

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
        `Você está prestes a excluir "${p.name}".\nTodas as tarefas e arquivos associados serão removidos.\nEsta ação não pode ser desfeita.`,
        { title: "Excluir projeto?", confirmLabel: "Excluir projeto", destructive: true },
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
    if (
      !(await confirm(`"${p.name}" sai das listas ativas, mas nada é apagado.`, {
        title: "Arquivar projeto?",
        confirmLabel: "Arquivar",
      }))
    ) {
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
    <>
      <PageContainer className="space-y-4 md:space-y-8">
        <PageHeader
          title="Projetos"
          description="Organize tarefas e entregas do time."
          actionsSlot={
            <>
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
            </>
          }
        />

        {hasAnyProject && (
          <KpiStrip aria-label="Resumo de projetos">
            <KpiCell label="Projetos ativos" value={ativosCount} />
            <KpiCell label="Em risco" value={emRiscoCount} tone="warning" />
            <KpiCell label="Tarefas atrasadas" value={tarefasAtrasadasCount} tone="danger" />
          </KpiStrip>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="surface-card h-[124px] animate-pulse border-transparent" />
            ))}
          </div>
        ) : !hasAnyProject ? (
          <EmptyState
            icon={<FolderKanban className="h-5 w-5" />}
            title="Nenhum projeto cadastrado ainda"
            description="Crie o primeiro projeto para organizar tarefas e entregas do time."
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
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
              className="flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium text-text-brand hover:underline"
            >
              {showEncerrados
                ? "Ocultar projetos encerrados"
                : `Ver projetos encerrados (${encerradosCount})`}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showEncerrados ? "rotate-180" : ""}`}
              />
            </button>

            {showEncerrados && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
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
    </>
  );
}

/* ============================================================
 * Criação/edição de projeto — UM painel só, em seções (identidade →
 * áreas do projeto → campos dos influenciadores [só se a área estiver
 * marcada] → navegação). O antigo wizard de 4 etapas com stepper e "revisão"
 * fazia criar um projeto parecer configurar uma plataforma; aqui nada é
 * etapa: é um formulário curto que já abre pronto pra "Criar projeto".
 * ============================================================ */

/** Campos do cadastro de influenciador agrupados por assunto (o que cada
 * campo é, não a ordem em que foi criado). */
const INFLUENCER_FIELD_GROUPS: { title: string; keys: InfluencerFieldKey[] }[] = [
  { title: "Perfil", keys: ["redes", "metricas"] },
  { title: "Operação", keys: ["entregas", "status"] },
  { title: "Financeiro", keys: ["pagamentos", "bancario"] },
  { title: "Documentação", keys: ["contrato"] },
];

const FEATURE_GROUP_TITLE = { core: "Essenciais", marketing: "Marketing" } as const;

function SelectRow({
  checked,
  onChange,
  label,
  hint,
  icon,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50">
      <Checkbox checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      {icon && <span className="mt-0.5 text-text-secondary">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-xs leading-snug text-text-secondary">{hint}</span>}
      </span>
    </label>
  );
}

function WizardSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border/60 py-6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-text-secondary">{description}</p>}
      </div>
      {children}
    </section>
  );
}

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
  const [layout] = useState<ProjectLayout>(initial?.layout ?? "tabs");
  const [status, setStatus] = useState<ProjectStatus>(initial?.status ?? DEFAULT_PROJECT_STATUS);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const { confirm, confirmDialog } = useConfirm();

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
      const ok = await confirm("Descartar as alterações não salvas neste projeto?", {
        title: "Descartar alterações?",
        confirmLabel: "Descartar",
        destructive: true,
      });
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Dê um nome ao projeto.");
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

  const inputCls =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-brand";

  return (
    <>
      <Sheet open onOpenChange={(v) => !v && void requestClose()}>
        <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <div className="border-b border-border/60 px-6 py-5">
            <SheetTitle>{initial ? "Editar projeto" : "Novo projeto"}</SheetTitle>
            <SheetDescription>
              {initial
                ? "Ajuste a identidade e as áreas deste projeto."
                : "Dê um nome e escolha as áreas que ele vai precisar. Dá pra mudar depois."}
            </SheetDescription>
          </div>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <WizardSection title="Identidade">
                <div className="space-y-4">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Nome</span>
                    <input
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder="Ex.: Lançamento verão 2026"
                      className={inputCls}
                      autoFocus
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Descrição <span className="font-normal text-text-secondary">(opcional)</span>
                    </span>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Sobre o que é este projeto?"
                      className={`${inputCls} resize-none`}
                    />
                  </label>
                  {/* Capa em uma linha só — opcional, nunca ocupa meia tela. */}
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
                    className="flex items-center gap-3 rounded-md"
                  >
                    <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {cover ? (
                        <img src={cover} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Capa <span className="font-normal text-text-secondary">(opcional)</span>
                      </p>
                      <div className="mt-1 flex items-center gap-2">
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
                          {cover ? "Trocar" : "Anexar imagem"}
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
                  {/* Status só aparece ao editar — um projeto novo sempre
                   * começa "ativo", sem fricção extra na criação. */}
                  {initial && (
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-foreground">Status</span>
                      <NativeSelect
                        value={status}
                        onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                        className={inputCls}
                      >
                        {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {PROJECT_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  )}
                </div>
              </WizardSection>

              <WizardSection
                title="Áreas do projeto"
                description="Quais áreas este projeto precisa? Cada uma vira uma seção dentro dele."
              >
                <div className="space-y-4">
                  {(["core", "marketing"] as const).map((group) => {
                    const items = FEATURES.filter((f) => (f.group ?? "core") === group);
                    if (items.length === 0) return null;
                    return (
                      <div key={group}>
                        <p className="mb-1 px-2 text-xs font-medium text-text-secondary">
                          {FEATURE_GROUP_TITLE[group]}
                        </p>
                        <div>
                          {items.map((f) => {
                            const Icon = FEATURE_ICONS[f.key];
                            return (
                              <SelectRow
                                key={f.key}
                                checked={features.includes(f.key)}
                                onChange={() => toggleFeature(f.key)}
                                label={f.label}
                                hint={f.hint}
                                icon={<Icon className="h-4 w-4" />}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </WizardSection>

              {features.includes("influenciadores") && (
                <WizardSection
                  title="Cadastro de influenciadores"
                  description="Quais informações cada influenciador deste projeto terá."
                >
                  <div className="space-y-3">
                    {INFLUENCER_FIELD_GROUPS.map((g) => (
                      <div key={g.title}>
                        <p className="mb-0.5 px-2 text-xs font-medium text-text-secondary">
                          {g.title}
                        </p>
                        {g.keys.map((key) => {
                          const sf = INFLUENCER_FIELDS.find((x) => x.key === key);
                          if (!sf) return null;
                          return (
                            <SelectRow
                              key={key}
                              checked={infFeatures.includes(key)}
                              onChange={() => toggleInfFeature(key)}
                              label={sf.label}
                              hint={sf.hint}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </WizardSection>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-4">
              <p className="min-w-0 truncate text-xs text-destructive" role="alert">
                {error}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => void requestClose()}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary">
                  {initial ? "Salvar alterações" : "Criar projeto"}
                </Button>
              </div>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  );
}
