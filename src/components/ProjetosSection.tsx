import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Search,
  Upload,
  X,
  Pencil,
  ImageIcon,
  Map,
  KanbanSquare,
  Users,
  FileText,
  ArrowUpRight,
  Check,
  CalendarDays,
  Megaphone,
  Newspaper,
  LayoutList,
  LayoutPanelTop,
} from "lucide-react";
import {
  FEATURES,
  DEFAULT_FEATURES,
  INFLUENCER_FIELDS,
  DEFAULT_INFLUENCER_FIELDS,
  loadProjetos,
  onProjetosChange,
  saveProjetos,
  type FeatureKey,
  type InfluencerFieldKey,
  type Project,
  type ProjectLayout,
} from "@/lib/projetos";
import { SectionHeader } from "./SectionHeader";
import CardSwap, { Card } from "@/components/CardSwap";

const FEATURE_ICONS: Record<FeatureKey, React.ComponentType<{ className?: string }>> = {
  roadmap: Map,
  kanban: KanbanSquare,
  influenciadores: Users,
  documentos: FileText,
  calendario_editorial: CalendarDays,
  trafego_pago: Megaphone,
  blog: Newspaper,
};

export function ProjetosSection() {
  const navigate = useNavigate();
  const [items, setItemsState] = useState<Project[]>(() => loadProjetos());
  const setItems = (u: Project[] | ((p: Project[]) => Project[])) =>
    setItemsState((prev) => {
      const next = typeof u === "function" ? (u as (p: Project[]) => Project[])(prev) : u;
      saveProjetos(next);
      return next;
    });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => onProjetosChange(() => setItemsState(loadProjetos())), []);

  const filtered = useMemo(
    () =>
      items.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase()),
      ),
    [items, query],
  );

  const handleSave = (p: Project, isNew: boolean) => {
    setItems((prev) =>
      prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p],
    );
    setOpen(false);
    setEditing(null);
    if (isNew) navigate({ to: "/projeto/$id", params: { id: p.id } });
  };

  const totalFuncionalidades = items.reduce((s, p) => s + (p.features?.length ?? 0), 0);
  const comInfluenciadores = items.filter((p) => p.features?.includes("influenciadores")).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <SectionHeader
        title="Projetos"
        subtitle={`${items.length} ${items.length === 1 ? "projeto" : "projetos"}`}
        kpis={[]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar"
                className="h-8 w-32 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring sm:w-48"
              />
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo projeto
            </button>
          </div>
        }
      />

      {items.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Em destaque
          </p>
          <div className="relative h-[280px] sm:h-[320px]">
            <CardSwap width={340} height={220} cardDistance={50} verticalDistance={50} delay={4500}>
              {items
                .slice(-5)
                .reverse()
                .map((p) => (
                  <Card
                    key={p.id}
                    onClick={() => navigate({ to: "/projeto/$id", params: { id: p.id } })}
                    className="cursor-pointer overflow-hidden !bg-card p-0 shadow-lg"
                  >
                    <div className="flex h-full flex-col">
                      <div className="h-24 shrink-0 overflow-hidden bg-muted">
                        {p.cover ? (
                          <img src={p.cover} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 p-3">
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {p.description || "Sem descrição"}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
            </CardSwap>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {items.length === 0 ? "Nenhum projeto ainda." : "Nenhum resultado."}
          </p>
          {items.length === 0 && (
            <button
              onClick={() => setOpen(true)}
              className="mt-3 text-xs font-medium text-foreground underline"
            >
              Criar o primeiro
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              p={p}
              onOpen={() => navigate({ to: "/projeto/$id", params: { id: p.id } })}
              onEdit={() => {
                setEditing(p);
                setOpen(true);
              }}
              onDelete={() => setItems((prev) => prev.filter((x) => x.id !== p.id))}
            />
          ))}
        </div>
      )}

      {open && (
        <ProjectDialog
          initial={editing}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ProjectCard({
  p,
  onOpen,
  onEdit,
  onDelete,
}: {
  p: Project;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group overflow-hidden rounded-lg border border-border bg-background transition-shadow hover:shadow-md">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-[16/9] w-full bg-muted">
          {p.cover ? (
            <img src={p.cover} alt={p.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>
      </button>
      <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex" />
      <div className="relative p-4">
        <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={onEdit} aria-label="Editar" className="rounded p-1 hover:bg-muted">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
          <button onClick={onDelete} aria-label="Remover" className="rounded p-1 hover:bg-muted">
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
        <button onClick={onOpen} className="group/link flex items-center gap-1 text-left">
          <p className="truncate text-sm font-medium text-foreground group-hover/link:underline">
            {p.name}
          </p>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/link:opacity-100" />
        </button>
        {p.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
        )}
        {p.features.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {p.features.map((f) => {
              const meta = FEATURES.find((x) => x.key === f);
              if (!meta) return null;
              const Icon = FEATURE_ICONS[f];
              return (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectDialog({
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
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  const toggle = (f: FeatureKey) =>
    setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  const toggleInf = (f: InfluencerFieldKey) =>
    setInfFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

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
      setError("Nome é obrigatório.");
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
        createdAt: initial?.createdAt ?? Date.now(),
        milestones: initial?.milestones ?? [],
        tasks: initial?.tasks ?? [],
        docs: initial?.docs ?? [],
      },
      isNew,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background shadow-xl"
      >
        {/* Cover hero */}
        <div
          ref={dragRef}
          onDragOver={(e) => {
            e.preventDefault();
            dragRef.current?.classList.add("ring-2", "ring-foreground");
          }}
          onDragLeave={() => dragRef.current?.classList.remove("ring-2", "ring-foreground")}
          onDrop={(e) => {
            e.preventDefault();
            dragRef.current?.classList.remove("ring-2", "ring-foreground");
            const f = e.dataTransfer.files?.[0];
            if (f) handleCoverFile(f);
          }}
          className="relative aspect-[3/1] w-full bg-muted"
        >
          {cover ? (
            <>
              <img src={cover} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <p className="text-xs">Arraste uma imagem ou clique em anexar</p>
            </div>
          )}
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleCoverFile(e.target.files[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md bg-background/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-background"
            >
              <Upload className="h-3.5 w-3.5" />
              {cover ? "Trocar capa" : "Anexar capa"}
            </button>
            {cover && (
              <button
                type="button"
                onClick={() => setCover(undefined)}
                aria-label="Remover capa"
                className="rounded-md bg-background/95 p-1.5 shadow-sm hover:bg-background"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute left-3 top-3 rounded-md bg-background/95 p-1.5 shadow-sm hover:bg-background"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="space-y-8 px-6 py-6">
          {/* Step 1 — Identidade */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                1
              </span>
              <h3 className="text-sm font-semibold text-foreground">Identidade do projeto</h3>
            </div>
            <div className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Nome
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Lançamento verão 2026"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
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
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </section>

          {/* Step 2 — Funcionalidades */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                  2
                </span>
                <h3 className="text-sm font-semibold text-foreground">Funcionalidades</h3>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {features.length} selecionada{features.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Escolha o que este projeto precisa. Cada funcionalidade vira uma seção dentro do
              projeto.
            </p>

            {(["core", "marketing"] as const).map((group) => {
              const groupItems = FEATURES.filter((f) => (f.group ?? "core") === group);
              if (groupItems.length === 0) return null;
              return (
                <div key={group} className="mb-4 last:mb-0">
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
                          onClick={() => toggle(f.key)}
                          aria-pressed={checked}
                          className={`group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                            checked
                              ? "border-foreground bg-muted"
                              : "border-border bg-background hover:border-foreground/40 hover:bg-muted/40"
                          }`}
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                              checked
                                ? "border-foreground bg-background text-foreground"
                                : "border-border bg-muted/50 text-muted-foreground"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-foreground">{f.label}</span>
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  checked
                                    ? "border-foreground bg-foreground text-background"
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

            {features.includes("influenciadores") && (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-foreground" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                    Configurar seção de influenciadores
                  </span>
                </div>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Escolha quais campos vão aparecer no cadastro de cada influenciador.
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {INFLUENCER_FIELDS.map((sf) => {
                    const checked = infFeatures.includes(sf.key);
                    return (
                      <button
                        type="button"
                        key={sf.key}
                        onClick={() => toggleInf(sf.key)}
                        className={`flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-left text-xs transition-colors ${
                          checked
                            ? "border-foreground bg-background"
                            : "border-border bg-background/60 hover:bg-background"
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
                              ? "border-foreground bg-foreground text-background"
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
          </section>

          {/* Step 3 — Exibição */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                3
              </span>
              <h3 className="text-sm font-semibold text-foreground">
                Exibição das funcionalidades
              </h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Como o time vai navegar pelas seções dentro do projeto.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    key: "tabs",
                    label: "Em abas",
                    hint: "Uma seção por vez, foco em contexto único.",
                    Icon: LayoutPanelTop,
                  },
                  {
                    key: "single",
                    label: "Página única",
                    hint: "Todas as seções empilhadas em uma rolagem.",
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
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                      checked
                        ? "border-foreground bg-muted"
                        : "border-border bg-background hover:border-foreground/40 hover:bg-muted/40"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                        checked
                          ? "border-foreground bg-background text-foreground"
                          : "border-border bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{opt.label}</span>
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            checked
                              ? "border-foreground bg-foreground text-background"
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
          </section>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            {initial ? "Salvar alterações" : "Criar projeto"}
          </button>
        </div>
      </form>
    </div>
  );
}
