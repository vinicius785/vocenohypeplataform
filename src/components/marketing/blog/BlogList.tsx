import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X, Newspaper, ImageIcon, Calendar } from "lucide-react";
import type { BlogPost, Project } from "@/lib/projetos";
import { notifyBlogEvent } from "@/lib/marketing.functions";
import { BlogEditor } from "./BlogEditor";
import { destinoLabel, statusInfo } from "./types";

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
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {posts.length} {posts.length === 1 ? "artigo" : "artigos"}
        </p>
        <button
          onClick={create}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Novo artigo
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-10 text-center">
          <Newspaper className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Nenhum artigo ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => {
            const s = statusInfo(p.status);
            return (
              <article
                key={p.id}
                className="group overflow-hidden rounded-lg border border-border bg-background"
              >
                <button onClick={() => setEditingId(p.id)} className="block w-full text-left">
                  <div className="relative aspect-video w-full bg-muted">
                    {p.cover ? (
                      <img src={p.cover} alt={p.title} className="h-full w-full object-cover" />
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
                  <div className="p-3">
                    <h3 className="line-clamp-2 text-sm font-semibold">{p.title}</h3>
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
                </button>
                <div className="flex items-center justify-end border-t border-border px-2 py-1">
                  <button
                    onClick={() => remove(p.id)}
                    aria-label="Excluir"
                    className="rounded p-1 hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
