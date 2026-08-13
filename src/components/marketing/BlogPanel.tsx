import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  X,
  Newspaper,
  ImageIcon,
  Calendar,
  Eye,
  Check,
  Heart,
  MessageCircle,
  Send,
} from "lucide-react";
import type { BlogPost, BlogStatus, Project } from "@/lib/projetos";
import { loadTeamMembers } from "@/lib/projetos";
import { CoverUploadField } from "./ImageUploadField";
import { notifyBlogEvent } from "@/lib/marketing.functions";
import { useClientes } from "@/lib/clientes-store";
import type { BlogComment } from "@/lib/blog-engagement";
import { initialsOf, colorFor } from "@/lib/blog-engagement";

/** Conversor bem simples de markdown pra HTML — só o suficiente pra
 * pré-visualização (títulos, negrito, itálico, listas, parágrafos). Não é
 * pra ser um parser completo, só dar uma ideia real de como o texto digitado
 * vai ficar formatado, sem precisar de uma lib externa. */
export function renderMarkdownLite(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = escape(md).split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };
  const inline = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    // Lista numerada ("1. ", "2) ") — antes só listas com marcador (-/*)
    // eram reconhecidas, então qualquer passo-a-passo numerado (comum em
    // "como fazer X") virava parágrafo corrido em vez de lista.
    const ordered = /^\d+[.)]\s+(.*)/.exec(line);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join("\n");
}

/** Classes compartilhadas por qualquer lugar que renderize
 * `renderMarkdownLite` (editor de blog e o dialog do Mural de novidades) —
 * define como cada tag HTML gerada aparece: espaçamento de parágrafo,
 * marcador de lista (bolinha vs. número), tamanho de título, etc. */
export const MARKDOWN_LITE_CLASSES =
  "space-y-2 text-sm leading-relaxed text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:list-decimal [&_li]:ml-5 [&_li]:pl-0.5 [&_p]:my-2 [&_strong]:font-semibold [&_em]:italic";

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Bloco de curtir + comentar de um artigo publicado — mesmo visual no
 * Mural interno (`InicioDashboard.tsx`) e no Portal do cliente
 * (`portal.$token.tsx`), cada um passando sua própria fonte de dados
 * (`src/lib/blog-engagement.ts` do lado VI, server functions de
 * `cliente-link.functions.ts` do lado VC). */
export function ArticleEngagement({
  likeCount,
  likedByMe,
  comments,
  onToggleLike,
  onAddComment,
  commentPlaceholder = "Escreva um comentário...",
}: {
  likeCount: number;
  likedByMe: boolean;
  comments: BlogComment[];
  onToggleLike: () => void;
  onAddComment: (body: string) => void | Promise<void>;
  commentPlaceholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onAddComment(body);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-6 space-y-4 border-t border-border pt-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleLike}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            likedByMe
              ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${likedByMe ? "fill-current" : ""}`} />
          {likeCount > 0 ? likeCount : "Curtir"}
        </button>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircle className="h-3.5 w-3.5" />
          {comments.length > 0 ? comments.length : "Comentar"}
        </span>
      </div>

      {comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${colorFor(c.authorLabel)}`}
              >
                {initialsOf(c.authorLabel) || "?"}
              </span>
              <div className="min-w-0 flex-1 rounded-xl bg-muted/50 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">{c.authorLabel}</span>
                  {c.authorKind === "cliente" && (
                    <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                      Cliente
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {fmtRelative(c.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-foreground">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder={commentPlaceholder}
          className="h-9 w-full rounded-full border border-border bg-background px-3.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!draft.trim() || sending}
          aria-label="Enviar comentário"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const STATUS: { key: BlogStatus; label: string; cls: string }[] = [
  {
    key: "agendado",
    label: "Agendado",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  {
    key: "publicado",
    label: "Publicado",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  {
    key: "despublicado",
    label: "Despublicado",
    cls: "bg-muted text-muted-foreground",
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

function destinoLabel(p: Pick<BlogPost, "audience" | "portalClienteIds">): string {
  const parts: string[] = [];
  if (p.audience?.includes("site")) parts.push("Site");
  if (p.audience?.includes("mural")) parts.push("Mural interno");
  if ((p.portalClienteIds?.length ?? 0) > 0) parts.push("Portal do cliente");
  return parts.length > 0 ? parts.join(" + ") : "Site";
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
  const [audiencePick, setAudiencePick] = useState(false);
  const [focusPortalOnOpen, setFocusPortalOnOpen] = useState(false);

  const setPosts = (next: BlogPost[]) => update({ blog: next });
  const notifyBlog = useServerFn(notifyBlogEvent);

  // "Portal do cliente" não é um destino à parte de Site/Mural (dá pra
  // combinar com qualquer um dos dois) — por isso cria com o destino
  // escolhido em `audience` e só sinaliza pro editor rolar/destacar a
  // lista de clientes, em vez de guardar um terceiro valor de `audience`
  // que não existe no tipo.
  const create = (audience: "site" | "mural", focusPortal = false) => {
    const p: BlogPost = {
      id: crypto.randomUUID(),
      title: "Novo artigo",
      status: "agendado",
      audience: [audience],
    };
    setPosts([p, ...posts]);
    setEditingId(p.id);
    setAudiencePick(false);
    setFocusPortalOnOpen(focusPortal);
  };

  const remove = (id: string) => {
    const removed = posts.find((p) => p.id === id);
    setPosts(posts.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
    // Só avisa se o artigo já tinha ido pro site — apagar um artigo ainda
    // agendado (nunca saiu daqui) não é um evento que o outro lado precise
    // saber.
    if (removed && removed.status !== "agendado" && removed.audience?.includes("site")) {
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
        focusPortal={focusPortalOnOpen}
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

/** Campos de texto (título/slug/resumo/conteúdo) vivem em estado local,
 * inicializado só quando o post muda (troca de artigo), e só sobem pro
 * componente pai (que persiste via `update({ blog })`, disparando um
 * round-trip pelo store compartilhado de projetos) num debounce. Antes
 * cada tecla disparava `onChange` direto no post vindo por prop — como
 * esse mesmo prop é recalculado a cada emissão do store compartilhado
 * (inclusive a que a própria digitação acabou de causar), o campo
 * controlado piscava/"apagava e reaparecia" a cada letra digitada.
 */
function BlogEditor({
  post,
  onChange,
  onClose,
  onDelete,
  focusPortal,
}: {
  post: BlogPost;
  onChange: (patch: Partial<BlogPost>) => void;
  onClose: () => void;
  onDelete: () => void;
  /** Veio de "Novo artigo" → "Portal do cliente" — rola até a lista de
   * clientes e destaca ela, já que aqui não é um "Destino" à parte (é
   * combinável com Site/Mural), então precisa chamar atenção pra onde
   * marcar de fato os clientes. */
  focusPortal?: boolean;
}) {
  const team = useMemo(() => loadTeamMembers(), []);
  const clientes = useClientes();
  const portalSectionRef = useRef<HTMLDivElement>(null);
  // "Destino" agora é multi-seleção: Site e Mural são toggles independentes
  // dentro de `audience` (array); "Portal do cliente" continua sendo um
  // toggle próprio (derivado de ter `portalClienteIds` marcado), combinável
  // com qualquer combinação dos outros dois. `portalEnabled` é estado de UI
  // próprio porque, ao ligar "Portal" agora, ainda não há cliente marcado
  // (senão a re-renderização desligaria o toggle de volta).
  const [portalEnabled, setPortalEnabled] = useState(
    () => focusPortal || (post.portalClienteIds?.length ?? 0) > 0,
  );
  useEffect(() => {
    setPortalEnabled((post.portalClienteIds?.length ?? 0) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);
  useEffect(() => {
    if (!focusPortal) return;
    portalSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusPortal]);
  const [draft, setDraft] = useState(post);
  const [savedTick, setSavedTick] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pendingRef = useRef(false);

  useEffect(() => {
    setDraft(post);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const flush = (next: BlogPost) => {
    pendingRef.current = false;
    onChange(next);
    setSavedTick((t) => t + 1);
  };

  // Se sair da tela (Voltar, trocar de artigo, fechar o painel) antes do
  // debounce dos 500ms disparar, a última mudança não podia ficar perdida.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        if (pendingRef.current) onChange(draftRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  // Campos digitados: atualiza o rascunho na hora (preview reage
  // instantaneamente) e só propaga pro pai/persistência 500ms depois de
  // parar de digitar.
  const patchDebounced = (patch: Partial<BlogPost>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      pendingRef.current = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => flush(next), 500);
      return next;
    });
  };
  // Campos de escolha (select, upload de capa, data): não têm o problema
  // de "digitar" — propaga na hora.
  const patchImmediate = (patch: Partial<BlogPost>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      flush(next);
      return next;
    });
  };

  const handleClose = () => {
    if (debounceRef.current && pendingRef.current) {
      window.clearTimeout(debounceRef.current);
      flush(draftRef.current);
    }
    onClose();
  };

  const p = draft;
  const statusInfo = STATUS.find((s) => s.key === p.status)!;
  const authorPhoto = p.authorId ? team.find((m) => m.id === p.authorId)?.photo : undefined;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button
          onClick={handleClose}
          className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted"
        >
          ← Voltar
        </button>
        <span className="text-sm font-light tracking-tight text-foreground">
          {p.title || "Novo artigo"}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusInfo.cls}`}>
          {statusInfo.label}
        </span>
        <span
          key={savedTick}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
        >
          <Check className="h-3 w-3" /> Salvo
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={onDelete}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            Excluir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_280px]">
        <div className="space-y-3 rounded-xl border border-border bg-background p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Conteúdo
          </p>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Título</span>
            <input
              value={p.title}
              onChange={(e) => {
                const title = e.target.value;
                patchDebounced({ title, slug: p.slug ? p.slug : slugify(title) });
              }}
              className="w-full border-0 bg-transparent p-0 text-xl font-semibold outline-none focus:ring-0"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Slug</span>
            <input
              value={p.slug ?? ""}
              onChange={(e) => patchDebounced({ slug: slugify(e.target.value) })}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Resumo</span>
            <textarea
              value={p.excerpt ?? ""}
              onChange={(e) => patchDebounced({ excerpt: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Conteúdo</span>
            <textarea
              value={p.content ?? ""}
              onChange={(e) => patchDebounced({ content: e.target.value })}
              rows={20}
              placeholder="Escreva o artigo... (markdown básico: # título, **negrito**, *itálico*, - lista)"
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Eye className="h-3.5 w-3.5" /> Pré-visualização
          </p>
          <article className="max-h-[520px] overflow-y-auto rounded-md border border-border bg-background p-4">
            {p.cover && (
              <img
                src={p.cover}
                alt=""
                className="mb-3 aspect-video w-full rounded-md object-cover"
              />
            )}
            {p.category && (
              <span className="mb-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {p.category}
              </span>
            )}
            <h1 className="text-xl font-light leading-tight tracking-tight">
              {p.title || "Sem título"}
            </h1>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {authorPhoto ? (
                <img src={authorPhoto} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ${colorFor(p.authorName || "?")}`}
                >
                  {initialsOf(p.authorName || "") || "?"}
                </span>
              )}
              <span className="font-medium text-foreground">{p.authorName || "Sem autor"}</span>
              {p.publishDate && (
                <span>· {new Date(p.publishDate).toLocaleDateString("pt-BR")}</span>
              )}
            </div>
            {p.excerpt && <p className="mt-2 text-sm italic text-muted-foreground">{p.excerpt}</p>}
            <div
              className={`mt-4 ${MARKDOWN_LITE_CLASSES}`}
              dangerouslySetInnerHTML={{
                __html:
                  renderMarkdownLite(p.content ?? "") ||
                  '<p class="text-muted-foreground">O conteúdo aparece aqui conforme você escreve.</p>',
              }}
            />
          </article>
        </div>

        <aside className="space-y-3 rounded-xl border border-border bg-background p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Publicação
          </p>
          <CoverUploadField cover={p.cover} onChange={(cover) => patchImmediate({ cover })} />

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Autor (time)</span>
            <div className="flex items-center gap-2">
              {authorPhoto ? (
                <img
                  src={authorPhoto}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${colorFor(p.authorName || "?")}`}
                >
                  {initialsOf(p.authorName || "") || "?"}
                </span>
              )}
              <select
                value={p.authorId ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const m = team.find((x) => x.id === id);
                  patchImmediate({ authorId: id || undefined, authorName: m?.name });
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
            </div>
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
              onChange={(e) => patchDebounced({ authorName: e.target.value, authorId: undefined })}
              className={inputCls}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Categoria</span>
            <input
              value={p.category ?? ""}
              onChange={(e) => patchDebounced({ category: e.target.value })}
              placeholder="Marketing, Design..."
              className={inputCls}
            />
          </label>

          <div className="block space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Destino</span>
            <p className="text-[10px] text-muted-foreground">
              Pode marcar mais de um ao mesmo tempo.
            </p>
            <div className="space-y-1 rounded-md border border-border bg-background p-2">
              {(
                [
                  { key: "site" as const, label: "Site" },
                  { key: "mural" as const, label: "Mural de novidades (time interno)" },
                ] satisfies { key: "site" | "mural"; label: string }[]
              ).map(({ key, label }) => {
                const checked = p.audience?.includes(key) ?? false;
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const prev = p.audience ?? [];
                        const next = e.target.checked
                          ? [...prev, key]
                          : prev.filter((a) => a !== key);
                        patchImmediate({ audience: next });
                      }}
                    />
                    {label}
                  </label>
                );
              })}
              <label className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted">
                <input
                  type="checkbox"
                  checked={portalEnabled}
                  onChange={(e) => {
                    setPortalEnabled(e.target.checked);
                    if (!e.target.checked) patchImmediate({ portalClienteIds: [] });
                  }}
                />
                Portal do cliente
              </label>
            </div>
          </div>

          {portalEnabled && (
            <div
              ref={portalSectionRef}
              className={`space-y-1.5 rounded-md transition-shadow ${focusPortal ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
            >
              <span className="text-[11px] font-medium text-muted-foreground">
                Quais clientes veem esse artigo
              </span>
              {clientes.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  Cadastre clientes na aba Clientes pra poder selecionar.
                </p>
              ) : (
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-2">
                  {clientes.map((c) => {
                    const checked = p.portalClienteIds?.includes(c.id) ?? false;
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const prev = p.portalClienteIds ?? [];
                            const next = e.target.checked
                              ? [...prev, c.id]
                              : prev.filter((id) => id !== c.id);
                            patchImmediate({ portalClienteIds: next });
                          }}
                        />
                        {c.empresa}
                      </label>
                    );
                  })}
                </div>
              )}
              {(p.portalClienteIds?.length ?? 0) > 0 && p.status !== "publicado" && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  Só aparece no portal quando o status for &quot;Publicado&quot;.
                </p>
              )}
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Status</span>
            <select
              value={p.status}
              onChange={(e) => patchImmediate({ status: e.target.value as BlogStatus })}
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
              onChange={(e) => patchImmediate({ publishDate: e.target.value || undefined })}
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
  onPick: (a: "site" | "mural", focusPortal?: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-lg"
      >
        <h3 className="text-sm font-semibold">Qual o destino do artigo?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha onde este artigo será publicado. Portal do cliente pode ser combinado com qualquer
          um dos outros — dá pra marcar os clientes depois, dentro do editor.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
          <button
            onClick={() => onPick("site", true)}
            className="rounded-lg border border-border p-4 text-left hover:border-foreground hover:bg-muted/50"
          >
            <div className="text-sm font-semibold">Portal do cliente</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Aparece no portal dos clientes que você escolher.
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
