import { useMemo, useState } from "react";
import { Plus, X, Newspaper, ImageIcon, Calendar } from "lucide-react";
import type { BlogPost, BlogStatus, Project } from "@/lib/projetos";
import { loadTeamMembers } from "@/lib/projetos";
import { CoverUploadField } from "./ImageUploadField";

const STATUS: { key: BlogStatus; label: string; cls: string }[] = [
  { key: "rascunho", label: "Rascunho", cls: "bg-muted text-foreground" },
  {
    key: "revisao",
    label: "Em revisão",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  {
    key: "publicado",
    label: "Publicado",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
];

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export function BlogPanel({
  project,
  update,
}: {
  project: Project;
  update: (p: Partial<Project>) => void;
}) {
  const posts = project.blog ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [audiencePick, setAudiencePick] = useState(false);

  const setPosts = (next: BlogPost[]) => update({ blog: next });

  const create = (audience: "site" | "mural") => {
    const p: BlogPost = {
      id: crypto.randomUUID(),
      title: "Novo artigo",
      status: "rascunho",
      audience,
    };
    setPosts([p, ...posts]);
    setEditingId(p.id);
    setAudiencePick(false);
  };

  const remove = (id: string) => {
    setPosts(posts.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
  };
  const change = (id: string, patch: Partial<BlogPost>) => {
    setPosts(posts.map((p) => (p.id === id ? { ...p, ...patch } : p)));
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
          onClick={() => setAudiencePick(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Novo artigo
        </button>
      </div>

      {audiencePick && <AudienceDialog onPick={create} onClose={() => setAudiencePick(false)} />}

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-10 text-center">
          <Newspaper className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Nenhum artigo ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => {
            const s = STATUS.find((x) => x.key === p.status)!;
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
                      {s.label}
                    </span>
                    <span className="absolute left-2 top-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow">
                      {p.audience === "mural" ? "Mural interno" : "Site"}
                    </span>
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-2 text-sm font-semibold">{p.title}</h3>
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {p.excerpt || "Sem resumo."}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="truncate">{p.authorName || "Sem autor"}</span>
                      {p.publishDate && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(p.publishDate).toLocaleDateString("pt-BR")}
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

function BlogEditor({
  post,
  onChange,
  onClose,
  onDelete,
}: {
  post: BlogPost;
  onChange: (patch: Partial<BlogPost>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const team = useMemo(() => loadTeamMembers(), []);
  const p = post;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
        >
          ← Voltar
        </button>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS.find((s) => s.key === p.status)!.cls}`}
        >
          {STATUS.find((s) => s.key === p.status)!.label}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={onDelete}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            Excluir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Título</span>
            <input
              value={p.title}
              onChange={(e) => {
                const title = e.target.value;
                onChange({ title, slug: p.slug ? p.slug : slugify(title) });
              }}
              className="w-full border-0 bg-transparent p-0 text-xl font-semibold outline-none focus:ring-0"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Slug</span>
            <input
              value={p.slug ?? ""}
              onChange={(e) => onChange({ slug: slugify(e.target.value) })}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Resumo</span>
            <textarea
              value={p.excerpt ?? ""}
              onChange={(e) => onChange({ excerpt: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Conteúdo</span>
            <textarea
              value={p.content ?? ""}
              onChange={(e) => onChange({ content: e.target.value })}
              rows={16}
              placeholder="Escreva o artigo... (Markdown suportado)"
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        <aside className="space-y-3 rounded-lg border border-border bg-background p-4">
          <CoverUploadField cover={p.cover} onChange={(cover) => onChange({ cover })} />

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Autor (time)</span>
            <select
              value={p.authorId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                const m = team.find((x) => x.id === id);
                onChange({ authorId: id || undefined, authorName: m?.name });
              }}
              className={inputCls}
            >
              <option value="">— Nenhum —</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.role ? ` · ${m.role}` : ""}
                </option>
              ))}
            </select>
            {team.length === 0 && (
              <p className="text-[10px] text-muted-foreground">
                Cadastre membros na aba Time para vincular autores.
              </p>
            )}
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              Autor (texto livre)
            </span>
            <input
              value={p.authorName ?? ""}
              onChange={(e) => onChange({ authorName: e.target.value, authorId: undefined })}
              className={inputCls}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Categoria</span>
            <input
              value={p.category ?? ""}
              onChange={(e) => onChange({ category: e.target.value })}
              placeholder="Marketing, Design..."
              className={inputCls}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Destino</span>
            <select
              value={p.audience ?? "site"}
              onChange={(e) => onChange({ audience: e.target.value as "site" | "mural" })}
              className={inputCls}
            >
              <option value="site">Artigo do site</option>
              <option value="mural">Mural de novidades (time interno)</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Status</span>
            <select
              value={p.status}
              onChange={(e) => onChange({ status: e.target.value as BlogStatus })}
              className={inputCls}
            >
              {STATUS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              Data de publicação
            </span>
            <input
              type="date"
              value={p.publishDate ?? ""}
              onChange={(e) => onChange({ publishDate: e.target.value || undefined })}
              className={inputCls}
            />
          </label>
        </aside>
      </div>
    </div>
  );
}

function AudienceDialog({
  onPick,
  onClose,
}: {
  onPick: (a: "site" | "mural") => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-lg"
      >
        <h3 className="text-sm font-semibold">Qual o destino do artigo?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha onde este artigo será publicado.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            onClick={() => onPick("site")}
            className="rounded-lg border border-border p-4 text-left hover:border-foreground hover:bg-muted/50"
          >
            <div className="text-sm font-semibold">Site</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Artigo público para o blog do site.
            </div>
          </button>
          <button
            onClick={() => onPick("mural")}
            className="rounded-lg border border-border p-4 text-left hover:border-foreground hover:bg-muted/50"
          >
            <div className="text-sm font-semibold">Mural de novidades</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Comunicado interno exibido na aba Início.
            </div>
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
