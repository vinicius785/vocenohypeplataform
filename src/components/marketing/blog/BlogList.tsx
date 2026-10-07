import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Plus,
  Newspaper,
  ImageIcon,
  Calendar,
  MoreVertical,
  Trash2,
} from "lucide-react";
import type { BlogPost, BlogStatus, Project } from "@/lib/projetos";
import { notifyBlogEvent } from "@/lib/marketing.functions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/hooks/use-confirm";
import { BlogEditor } from "./BlogEditor";
import { destinoLabel, statusInfo, STATUS } from "./types";
import { Button } from "@/components/ui/button";
import { editorialDate, formatEditorialDate, reconcilePublication } from "@/lib/blog-publication";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  FilterChips,
  FilterGroup,
  FilterPill,
  FilterPopover,
  FilterRow,
  FilterSearch,
  FilterToolbar,
  SortMenu,
} from "@/components/shared/FilterToolbar";

type DestinoFilter = "todos" | "site" | "mural" | "portal";
type SortKey = "recentes" | "titulo";

const DESTINO_LABEL: Record<DestinoFilter, string> = {
  todos: "Todos",
  site: "Site",
  mural: "Mural interno",
  portal: "Portal do cliente",
};
const SORT_LABEL: Record<SortKey, string> = { recentes: "Mais recentes", titulo: "Título (A–Z)" };

function fmtScheduled(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function BlogPanel({
  project,
  update,
  editingId: controlledEditingId,
  onEditingIdChange,
  onBack,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
  /** Controlado pela página do Projeto: ao editar um artigo ela mostra SÓ o editor (modo focado). */
  editingId?: string | null;
  onEditingIdChange?: (id: string | null) => void;
  /** Quando o Blog é aberto por "Recursos", a listagem ganha o título e o caminho de volta ao projeto. */
  onBack?: () => void;
}) {
  const posts = project.blog ?? [];
  const [internalEditingId, setInternalEditingId] = useState<string | null>(null);
  const editingId = controlledEditingId !== undefined ? controlledEditingId : internalEditingId;
  const setEditingId = (id: string | null) => {
    setInternalEditingId(id);
    onEditingIdChange?.(id);
  };

  const setPosts = (next: BlogPost[]) => update({ blog: next });
  const notifyBlog = useServerFn(notifyBlogEvent);

  const create = () => {
    const p: BlogPost = {
      id: crypto.randomUUID(),
      title: "Novo artigo",
      status: "rascunho",
    };
    setPosts([p, ...posts]);
    setEditingId(p.id);
  };

  const remove = (id: string) => {
    const removed = posts.find((p) => p.id === id);
    setPosts(posts.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
    // Só avisa se o artigo já tinha ido pro site — apagar um rascunho ou
    // agendado (nunca saiu daqui) não é um evento que o outro lado precise
    // saber.
    if (
      removed &&
      removed.status !== "rascunho" &&
      removed.status !== "agendado" &&
      removed.audience?.includes("site")
    ) {
      void notifyBlog({ data: { action: "delete", id: removed.id } }).catch((err) =>
        console.error("[BlogWebhook] request failed", err),
      );
    }
  };
  const change = (id: string, patch: Partial<BlogPost>) => {
    let updated: BlogPost | undefined;
    const previous = posts.find((p) => p.id === id);
    setPosts(
      posts.map((p) => {
        if (p.id !== id) return p;
        updated = reconcilePublication(p, { ...p, ...patch }, new Date().toISOString());
        return updated;
      }),
    );
    if (!updated) return;
    // Avisa o Make (webhook único de blog, ver src/lib/blog-webhook.ts) sempre
    // que um artigo com destino "Site" for salvo publicado (primeira vez ou
    // edições seguintes) ou passar a despublicado vindo de outro status.
    if (updated.status === "publicado" && updated.audience?.includes("site")) {
      void notifyBlog({
        data: {
          action: "upsert",
          id: updated.id,
          title: updated.title,
          slug: updated.slug,
          excerpt: updated.excerpt,
          content: updated.content,
          cover: updated.cover,
          category: updated.category,
          authorName: updated.authorName,
        },
      }).catch((err) => console.error("[BlogWebhook] request failed", err));
    }
    if (
      updated.status === "despublicado" &&
      previous?.status !== "despublicado" &&
      updated.audience?.includes("site")
    ) {
      void notifyBlog({ data: { action: "archive", id: updated.id } }).catch((err) =>
        console.error("[BlogWebhook] request failed", err),
      );
    }
  };

  const editing = posts.find((p) => p.id === editingId) ?? null;
  const { confirm, confirmDialog } = useConfirm();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<BlogStatus | "todos">("todos");
  const [destinoFilter, setDestinoFilter] = useState<DestinoFilter>("todos");
  const [sort, setSort] = useState<SortKey>("recentes");

  // `create()` sempre insere no início do array (`[p, ...posts]`), então
  // a ordem natural já É "mais recentes primeiro" — sem precisar de um
  // campo de data que `BlogPost` não tem.
  const visiblePosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = posts.filter((p) => {
      const matchesQuery =
        !q || p.title.toLowerCase().includes(q) || (p.excerpt ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "todos" || p.status === statusFilter;
      const matchesDestino =
        destinoFilter === "todos" ||
        (destinoFilter === "site" && p.audience?.includes("site")) ||
        (destinoFilter === "mural" && p.audience?.includes("mural")) ||
        (destinoFilter === "portal" && (p.portalClienteIds?.length ?? 0) > 0);
      return matchesQuery && matchesStatus && matchesDestino;
    });
    if (sort === "titulo") list = [...list].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    return list;
  }, [posts, query, statusFilter, destinoFilter, sort]);

  const blogChips = [
    ...(statusFilter !== "todos"
      ? [
          {
            id: "status",
            label: statusInfo(statusFilter).label,
            onRemove: () => setStatusFilter("todos"),
          },
        ]
      : []),
    ...(destinoFilter !== "todos"
      ? [
          {
            id: "destino",
            label: DESTINO_LABEL[destinoFilter],
            onRemove: () => setDestinoFilter("todos"),
          },
        ]
      : []),
  ];
  const clearBlogFilters = () => {
    setStatusFilter("todos");
    setDestinoFilter("todos");
  };

  const removeWithConfirm = async (p: BlogPost) => {
    if (!(await confirm(`Excluir "${p.title}"? Isso não pode ser desfeito.`))) return;
    remove(p.id);
  };

  if (editing) {
    return (
      <BlogEditor
        post={editing}
        onChange={(patch) => change(editing.id, patch)}
        onClose={() => setEditingId(null)}
        onDelete={() => remove(editing.id)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {onBack && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-md text-xs text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {project.name}
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Blog</h1>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">
          {posts.length} {posts.length === 1 ? "artigo" : "artigos"}
        </p>
        <Button variant="primary" size="sm" onClick={create}>
          <Plus className="h-3.5 w-3.5" /> Novo artigo
        </Button>
      </div>

      <FilterToolbar>
        <FilterRow>
          <FilterSearch value={query} onChange={setQuery} placeholder="Buscar artigo" />
          <FilterPopover
            title="Filtrar artigos"
            activeCount={blogChips.length}
            onClear={clearBlogFilters}
          >
            <FilterGroup label="Status">
              <FilterPill
                active={statusFilter === "todos"}
                onClick={() => setStatusFilter("todos")}
              >
                Todos
              </FilterPill>
              {STATUS.map((s) => (
                <FilterPill
                  key={s.key}
                  active={statusFilter === s.key}
                  onClick={() => setStatusFilter(s.key)}
                >
                  {s.label}
                </FilterPill>
              ))}
            </FilterGroup>
            <FilterGroup label="Destino">
              {(Object.keys(DESTINO_LABEL) as DestinoFilter[]).map((d) => (
                <FilterPill
                  key={d}
                  active={destinoFilter === d}
                  onClick={() => setDestinoFilter(d)}
                >
                  {DESTINO_LABEL[d]}
                </FilterPill>
              ))}
            </FilterGroup>
          </FilterPopover>
          <SortMenu value={sort} options={SORT_LABEL} onChange={setSort} />
        </FilterRow>
        <FilterChips chips={blogChips} onClear={clearBlogFilters} />
      </FilterToolbar>

      {posts.length === 0 ? (
        <EmptyState
          compact
          icon={<Newspaper className="h-5 w-5" />}
          title="Nenhum artigo ainda."
          primaryAction={{ label: "Novo artigo", onClick: create }}
        />
      ) : visiblePosts.length === 0 ? (
        <EmptyState compact title="Nenhum resultado para esta busca ou filtro." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visiblePosts.map((p) => {
            const s = statusInfo(p.status);
            return (
              <article
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => setEditingId(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditingId(p.id);
                  }
                }}
                aria-label={`Editar artigo ${p.title}`}
                className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:shadow-none"
              >
                <div className="relative aspect-video w-full bg-muted">
                  {p.cover ? (
                    <img
                      src={p.cover}
                      alt=""
                      className="h-full w-full object-cover object-center"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <span
                    className={`absolute right-2 top-2 rounded px-1.5 py-0.5 text-[11px] ${s.cls}`}
                  >
                    {p.status === "agendado" && p.publishDate
                      ? `Agendado · ${fmtScheduled(p.publishDate)}`
                      : s.label}
                  </span>
                  <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground shadow">
                    {destinoLabel(p)}
                  </span>
                </div>
                <div className="flex items-start gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                      {p.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {p.excerpt || "Sem resumo."}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="truncate">{p.authorName || "Sem autor"}</span>
                      {p.status === "publicado" && editorialDate(p) && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatEditorialDate(editorialDate(p))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Mais opções de ${p.title}`}
                          className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => void removeWithConfirm(p)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
