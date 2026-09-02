import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Check, Loader2 } from "lucide-react";
import type { BlogPost } from "@/lib/projetos";
import { loadTeamMembers } from "@/lib/projetos";
import { initialsOf, colorFor } from "@/lib/blog-engagement";
import { renderMarkdownLite, MARKDOWN_LITE_CLASSES } from "./markdown";
import { BlogToolbar } from "./Toolbar";
import { PublishSidebar, type FieldRefs } from "./PublishSidebar";
import { PublishActions } from "./PublishActions";
import { slugify, statusInfo } from "./types";

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring";

function fmtDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Header de status do artigo — cada estado (rascunho/agendado/publicado/
 * despublicado) tem uma composição visual própria, não um badge genérico:
 * publicado destaca data/hora e destinos; agendado destaca a data/hora
 * marcada; os demais mostram só o rótulo neutro. */
function StatusHeader({ post }: { post: BlogPost }) {
  if (post.status === "publicado") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        🟢 Publicado
        {post.publishedAt && (
          <span className="text-emerald-700/70 dark:text-emerald-400/70">
            · {fmtDateTime(post.publishedAt)}
          </span>
        )}
      </span>
    );
  }
  if (post.status === "agendado") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        Agendado
        {post.publishDate && (
          <span className="text-amber-700/70 dark:text-amber-400/70">
            · {fmtDateTime(post.publishDate)}
          </span>
        )}
      </span>
    );
  }
  const s = statusInfo(post.status);
  return <span className={`rounded-full px-2.5 py-1 text-[11px] ${s.cls}`}>{s.label}</span>;
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
export function BlogEditor({
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
  const [portalEnabled, setPortalEnabled] = useState(
    () => (post.portalClienteIds?.length ?? 0) > 0,
  );
  useEffect(() => {
    setPortalEnabled((post.portalClienteIds?.length ?? 0) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const [draft, setDraft] = useState(post);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pendingRef = useRef(false);

  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [previewTab, setPreviewTab] = useState<"site" | "mural" | "portal">("site");

  useEffect(() => {
    setDraft(post);
    setScheduleMode("now");
    setScheduleAt("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const flush = (next: BlogPost) => {
    pendingRef.current = false;
    onChange(next);
    setSaveState("saved");
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

  const patchDebounced = (patch: Partial<BlogPost>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      pendingRef.current = true;
      setSaveState("saving");
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => flush(next), 500);
      return next;
    });
  };
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
  const authorPhoto = p.authorId ? team.find((m) => m.id === p.authorId)?.photo : undefined;
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const fieldRefs: FieldRefs = {
    title: useRef<HTMLInputElement>(null),
    content: contentRef,
    author: useRef<HTMLDivElement>(null),
    destino: useRef<HTMLDivElement>(null),
    portalClientes: useRef<HTMLDivElement>(null),
    schedule: useRef<HTMLDivElement>(null),
  };
  const focusField = (key: "title" | "content" | "author" | "destino" | "portalClientes") => {
    const target = fieldRefs[key]?.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (key === "title") fieldRefs.title.current?.focus();
    if (key === "content") fieldRefs.content.current?.focus();
  };
  const requestSchedule = () => {
    setScheduleMode("schedule");
    fieldRefs.schedule.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const destinosDisponiveis: ("site" | "mural" | "portal")[] = [
    ...(p.audience?.includes("site") ? (["site"] as const) : []),
    ...(p.audience?.includes("mural") ? (["mural"] as const) : []),
    ...((p.portalClienteIds?.length ?? 0) > 0 ? (["portal"] as const) : []),
  ];
  const activePreviewTab = destinosDisponiveis.includes(previewTab)
    ? previewTab
    : (destinosDisponiveis[0] ?? "site");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleClose}
          className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted"
        >
          ← Voltar
        </button>
        <span className="text-sm font-light tracking-tight text-foreground">
          {p.title || "Novo artigo"}
        </span>
        <StatusHeader post={p} />
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          {saveState === "saving" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
            </>
          ) : saveState === "saved" ? (
            <>
              <Check className="h-3 w-3" /> Salvo agora
            </>
          ) : null}
        </span>
        <button
          onClick={onDelete}
          className="rounded-full border border-border px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
        >
          Excluir
        </button>
        <PublishActions
          post={p}
          scheduleMode={scheduleMode}
          scheduleAt={scheduleAt}
          onPreview={() => setPreviewTab(activePreviewTab)}
          onPublishNow={() =>
            patchImmediate({
              status: "publicado",
              publishedAt: new Date().toISOString(),
              publishDate: new Date().toISOString(),
            })
          }
          onSchedule={(iso) => patchImmediate({ status: "agendado", publishDate: iso })}
          onUnpublish={() => patchImmediate({ status: "despublicado" })}
          onFocusField={focusField}
          onRequestSchedule={requestSchedule}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1.75fr_1.25fr]">
        <div className="space-y-3 rounded-xl border border-border bg-background p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Conteúdo
          </p>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Título</span>
            <input
              ref={fieldRefs.title}
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
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Conteúdo</span>
            <BlogToolbar
              textareaRef={contentRef}
              value={p.content ?? ""}
              onChange={(content) => patchDebounced({ content })}
            />
            <textarea
              ref={contentRef}
              value={p.content ?? ""}
              onChange={(e) => patchDebounced({ content: e.target.value })}
              rows={20}
              placeholder="Escreva o artigo... (markdown básico: # título, **negrito**, *itálico*, - lista)"
              className="w-full rounded-b-md rounded-t-none border border-border bg-background px-2.5 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Eye className="h-3.5 w-3.5" /> Pré-visualização
            </p>
            {destinosDisponiveis.length > 1 && (
              <div className="flex gap-1 rounded-md bg-background p-0.5 text-[10px]">
                {destinosDisponiveis.map((d) => (
                  <button
                    key={d}
                    onClick={() => setPreviewTab(d)}
                    className={`rounded px-2 py-1 font-medium ${
                      activePreviewTab === d ? "bg-muted text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {d === "site" ? "Site" : d === "mural" ? "Mural" : "Portal"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <article
            className={`max-h-[560px] overflow-y-auto rounded-md border p-4 ${
              activePreviewTab === "mural"
                ? "border-border bg-background shadow-sm"
                : "border-border bg-background"
            }`}
          >
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

        <PublishSidebar
          post={p}
          patchImmediate={patchImmediate}
          patchDebounced={patchDebounced}
          portalEnabled={portalEnabled}
          onPortalEnabledChange={setPortalEnabled}
          scheduleMode={scheduleMode}
          onScheduleModeChange={setScheduleMode}
          scheduleAt={scheduleAt}
          onScheduleAtChange={setScheduleAt}
          fieldRefs={fieldRefs}
        />
      </div>
    </div>
  );
}
