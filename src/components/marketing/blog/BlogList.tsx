import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Newspaper, ImageIcon, Calendar, MoreVertical, Trash2 } from "lucide-react";
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

type DestinoFilter = "todos" | "site" | "mural" | "portal";
type SortKey = "recentes" | "titulo";

function fmtScheduled(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function BlogPanel({
  project,
  update,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
}) {
  const posts = project.blog ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);

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
        updated = { ...p, ...patch };
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {posts.length} {posts.length === 1 ? "artigo" : "artigos"}
        </p>
        <button
          onClick={create}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover"
        >
          <Plus className="h-3.5 w-3.5" /> Novo artigo
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar artigo"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand sm:w-48"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as BlogStatus | "todos")}
          aria-label="Filtrar por status"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <option value="todos">Todos os status</option>
          {STATUS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={destinoFilter}
          onChange={(e) => setDestinoFilter(e.target.value as DestinoFilter)}
          aria-label="Filtrar por destino"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <option value="todos">Todos os destinos</option>
          <option value="site">Site</option>
          <option value="mural">Mural interno</option>
          <option value="portal">Portal do cliente</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Ordenar artigos"
          className="ml-auto h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <option value="recentes">Mais recentes</option>
          <option value="titulo">Título (A–Z)</option>
        </select>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-10 text-center">
          <Newspaper className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Nenhum artigo ainda.</p>
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-10 text-center">
          <p className="text-xs text-muted-foreground">Nenhum resultado para esta busca/filtro.</p>
        </div>
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
                    className={`absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] ${s.cls}`}
                  >
                    {p.status === "agendado" && p.publishDate
                      ? `Agendado · ${fmtScheduled(p.publishDate)}`
                      : s.label}
                  </span>
                  <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow">
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
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="truncate">{p.authorName || "Sem autor"}</span>
                      {p.status === "publicado" && p.publishedAt && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(p.publishedAt).toLocaleDateString("pt-BR")}
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
