import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { BlogPost } from "@/lib/projetos";
import { loadTeamMembers } from "@/lib/projetos";
import { initialsOf, colorFor } from "@/lib/blog-engagement";
import { renderMarkdownLite, MARKDOWN_LITE_CLASSES } from "./markdown";
import { BlogToolbar } from "./Toolbar";
import { ArticleSettings, type FieldRefs } from "./ArticleSettings";
import { PublishActions } from "./PublishActions";
import { slugify, statusInfo } from "./types";

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
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  // Autor: "time" (usuário cadastrado) ou "personalizado" (texto livre) — decisão explícita, só
  // o campo do tipo escolhido aparece. Inicial: texto livre só se há nome sem usuário vinculado.
  const [authorMode, setAuthorMode] = useState<"team" | "custom">(() =>
    !post.authorId && (post.authorName ?? "").trim() ? "custom" : "team",
  );

  useEffect(() => {
    setDraft(post);
    setScheduleMode("now");
    setScheduleAt("");
    setMode("edit");
    setAuthorMode(!post.authorId && (post.authorName ?? "").trim() ? "custom" : "team");
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

  const goPreview = () => {
    setPreviewTab(activePreviewTab);
    setMode("preview");
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho do artigo: contexto à esquerda, ações à direita — Publicar é a principal. */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-1 rounded-md text-xs text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Blog
          </button>
          <span className="min-w-0 max-w-[16rem] truncate text-sm font-medium text-foreground">
            {p.title || "Novo artigo"}
          </span>
          <StatusHeader post={p} />
          <span
            role="status"
            className="inline-flex items-center gap-1 text-xs text-text-secondary"
          >
            {saveState === "saving" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
              </>
            ) : saveState === "saved" ? (
              <>
                <Check className="h-3 w-3" /> Salvo
              </>
            ) : null}
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SegmentedControl
              aria-label="Modo do artigo"
              size="sm"
              value={mode}
              onChange={(v) => (v === "preview" ? goPreview() : setMode("edit"))}
              options={[
                { value: "edit", label: "Editar" },
                { value: "preview", label: "Pré-visualizar" },
              ]}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (debounceRef.current) window.clearTimeout(debounceRef.current);
                flush(draftRef.current);
              }}
            >
              {p.status === "rascunho" ? "Salvar rascunho" : "Salvar"}
            </Button>
            <PublishActions
              post={p}
              scheduleMode={scheduleMode}
              scheduleAt={scheduleAt}
              onPreview={goPreview}
              onPublishNow={() =>
                patchImmediate({
                  status: "publicado",
                  publishedAt: new Date().toISOString(),
                  publishDate: new Date().toISOString(),
                })
              }
              onSchedule={(iso) => patchImmediate({ status: "agendado", publishDate: iso })}
              onUnpublish={() => patchImmediate({ status: "despublicado" })}
              onFocusField={(key) => {
                setMode("edit");
                window.setTimeout(() => focusField(key), 50);
              }}
              onRequestSchedule={() => {
                setMode("edit");
                window.setTimeout(requestSchedule, 50);
              }}
            />
          </div>
        </div>
      </div>

      {mode === "edit" ? (
        <>
          {/* Editor: o conteúdo é o protagonista — coluna larga, título como campo editorial. */}
          <div className="mx-auto w-full max-w-4xl space-y-5">
            <input
              ref={fieldRefs.title}
              value={p.title}
              onChange={(e) => {
                const title = e.target.value;
                patchDebounced({ title, slug: p.slug ? p.slug : slugify(title) });
              }}
              aria-label="Título do artigo"
              placeholder="Digite o título do artigo"
              className="w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-text-secondary/60 focus:ring-0 md:text-4xl"
            />
            <textarea
              value={p.excerpt ?? ""}
              onChange={(e) => patchDebounced({ excerpt: e.target.value })}
              aria-label="Resumo do artigo"
              rows={2}
              placeholder="Resumo: uma ou duas frases que apresentam o artigo"
              className="w-full resize-none border-0 border-b border-border/60 bg-transparent px-0 pb-3 text-base text-text-secondary outline-none placeholder:text-text-secondary/60 focus:border-foreground/40 focus:ring-0"
            />
            <div>
              <BlogToolbar
                textareaRef={contentRef}
                value={p.content ?? ""}
                onChange={(content) => patchDebounced({ content })}
              />
              <textarea
                ref={contentRef}
                value={p.content ?? ""}
                onChange={(e) => patchDebounced({ content: e.target.value })}
                aria-label="Conteúdo do artigo"
                placeholder="Escreva o artigo... (markdown básico: # título, **negrito**, *itálico*, - lista)"
                className="min-h-[28rem] w-full rounded-b-lg rounded-t-none border border-border bg-background px-4 py-3 font-mono text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[34rem]"
              />
            </div>
          </div>

          <div className="mx-auto w-full max-w-4xl border-t border-border/60 pt-8">
            <ArticleSettings
              post={p}
              patchImmediate={patchImmediate}
              patchDebounced={patchDebounced}
              portalEnabled={portalEnabled}
              onPortalEnabledChange={setPortalEnabled}
              scheduleMode={scheduleMode}
              onScheduleModeChange={setScheduleMode}
              scheduleAt={scheduleAt}
              onScheduleAtChange={setScheduleAt}
              authorModeState={authorMode}
              onAuthorModeChange={setAuthorMode}
              fieldRefs={fieldRefs}
            />
            <div className="mt-8 flex justify-end">
              <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
                Excluir artigo
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {destinosDisponiveis.length > 1 && (
            <SegmentedControl
              aria-label="Ver como aparece em"
              size="sm"
              value={activePreviewTab}
              onChange={setPreviewTab}
              options={destinosDisponiveis.map((d) => ({
                value: d,
                label: d === "site" ? "Site" : d === "mural" ? "Mural" : "Portal",
              }))}
            />
          )}
          <ArticlePreview post={p} authorPhoto={authorPhoto} />
        </div>
      )}
    </div>
  );
}

/** Pré-visualização sob demanda — o mesmo markup de antes, só montado no modo "Pré-visualizar"
 * (não renderiza markdown nem carrega a imagem enquanto se escreve). */
function ArticlePreview({ post: p, authorPhoto }: { post: BlogPost; authorPhoto?: string }) {
  return (
    <article className="rounded-xl border border-border bg-background p-6 md:p-10">
      {p.cover && (
        <img src={p.cover} alt="" className="mb-6 aspect-video w-full rounded-lg object-cover" />
      )}
      {p.category && (
        <span className="mb-2 inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          {p.category}
        </span>
      )}
      <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        {p.title || "Sem título"}
      </h1>
      <div className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
        {authorPhoto ? (
          <img src={authorPhoto} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${colorFor(p.authorName || "?")}`}
          >
            {initialsOf(p.authorName || "") || "?"}
          </span>
        )}
        <span className="font-medium text-foreground">{p.authorName || "Sem autor"}</span>
        {p.publishDate && <span>· {new Date(p.publishDate).toLocaleDateString("pt-BR")}</span>}
      </div>
      {p.excerpt && <p className="mt-4 text-base italic text-text-secondary">{p.excerpt}</p>}
      <div
        className={`mt-6 ${MARKDOWN_LITE_CLASSES}`}
        dangerouslySetInnerHTML={{
          __html:
            renderMarkdownLite(p.content ?? "") ||
            '<p class="text-muted-foreground">O conteúdo aparece aqui conforme você escreve.</p>',
        }}
      />
    </article>
  );
}
