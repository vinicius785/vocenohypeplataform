import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Eye, Loader2, SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pendingRef = useRef(false);

  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [previewTab, setPreviewTab] = useState<"site" | "mural" | "portal">("site");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useIsMobile();
  // Autor: "time" (usuário cadastrado) ou "personalizado" (texto livre) — decisão explícita, só
  // o campo do tipo escolhido aparece. Inicial: texto livre só se há nome sem usuário vinculado.
  const [authorMode, setAuthorMode] = useState<"team" | "custom">(() =>
    !post.authorId && (post.authorName ?? "").trim() ? "custom" : "team",
  );

  useEffect(() => {
    setDraft(post);
    setScheduleMode("now");
    setScheduleAt("");
    setPreviewOpen(false);
    setSettingsOpen(false);
    setAuthorMode(!post.authorId && (post.authorName ?? "").trim() ? "custom" : "team");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const flush = (next: BlogPost) => {
    pendingRef.current = false;
    try {
      onChange(next);
      setSaveState("saved");
    } catch {
      // Mantém a edição pendente: "Tentar de novo" reenvia o mesmo rascunho.
      pendingRef.current = true;
      setSaveState("error");
    }
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
    setPreviewOpen(true);
  };

  // O corpo cresce com o conteúdo (altura inicial confortável, sem retângulo gigante fixo).
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
  }, [p.content]);

  const settings = (
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
  );

  return (
    <div className="space-y-8">
      {/* Cabeçalho do EDITOR — só o necessário: voltar ao Blog, onde estou, salvar e publicar. */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex items-center gap-x-3">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ArrowLeft className="h-4 w-4" /> Blog
          </button>
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {p.title || "Novo artigo"}
          </span>
          <span className="hidden shrink-0 sm:inline-flex">
            <StatusHeader post={p} />
          </span>
          <span
            role="status"
            className="hidden shrink-0 items-center gap-1 text-xs text-text-secondary md:inline-flex"
          >
            {saveState === "saving" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
              </>
            ) : saveState === "saved" ? (
              <>
                <Check className="h-3 w-3" /> Salvo
              </>
            ) : saveState === "error" ? (
              <span className="text-danger">Não foi possível salvar</span>
            ) : null}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {isMobile && (
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                <SlidersHorizontal className="h-3.5 w-3.5" /> Configurações
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={goPreview}>
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Pré-visualizar</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (debounceRef.current) window.clearTimeout(debounceRef.current);
                flush(draftRef.current);
              }}
            >
              {saveState === "error"
                ? "Tentar de novo"
                : p.status === "rascunho"
                  ? "Salvar rascunho"
                  : "Salvar"}
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
                if (isMobile) setSettingsOpen(true);
                window.setTimeout(() => focusField(key), isMobile ? 350 : 0);
              }}
              onRequestSchedule={() => {
                if (isMobile) setSettingsOpen(true);
                window.setTimeout(requestSchedule, isMobile ? 350 : 0);
              }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* EDITOR: o artigo é o protagonista — título e resumo editoriais, texto sem moldura de formulário. */}
        <div className="min-w-0 space-y-5">
          <input
            ref={fieldRefs.title}
            value={p.title}
            onChange={(e) => {
              const title = e.target.value;
              patchDebounced({ title, slug: p.slug ? p.slug : slugify(title) });
            }}
            aria-label="Título do artigo"
            placeholder="Digite o título..."
            className="w-full border-0 bg-transparent p-0 text-4xl font-semibold leading-tight tracking-tight text-foreground outline-none placeholder:text-text-secondary/50 focus:ring-0 md:text-5xl"
          />
          <textarea
            value={p.excerpt ?? ""}
            onChange={(e) => patchDebounced({ excerpt: e.target.value })}
            aria-label="Resumo do artigo"
            rows={2}
            placeholder="Uma ou duas frases que apresentam o artigo..."
            className="w-full resize-none border-0 bg-transparent p-0 text-lg leading-snug text-text-secondary outline-none placeholder:text-text-secondary/50 focus:ring-0"
          />
          <div className="pt-2">
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
              placeholder="Escreva o artigo..."
              className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-base leading-relaxed text-foreground outline-none placeholder:text-text-secondary/50 focus:ring-0"
              style={{ minHeight: 320 }}
            />
            <p className="mt-6 text-xs text-text-secondary">
              Formatação: # título · **negrito** · *itálico* · - lista · &gt; citação
            </p>
          </div>
          <div className="pt-6">
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
              Excluir artigo
            </Button>
          </div>
        </div>

        {/* CONFIGURAÇÕES: coluna lateral compacta (desktop); no mobile abrem em Sheet. */}
        {!isMobile && <aside className="self-start lg:sticky lg:top-24">{settings}</aside>}
      </div>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <div className="space-y-3 border-b border-border/60 px-6 py-4">
            <SheetTitle>Pré-visualização</SheetTitle>
            <SheetDescription className="sr-only">Como o artigo será apresentado.</SheetDescription>
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
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {previewOpen && <ArticlePreview post={p} authorPhoto={authorPhoto} />}
          </div>
          <div className="flex justify-end border-t border-border/60 px-6 py-3">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>
              Voltar para edição
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {isMobile && (
        <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
          <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
            <div className="border-b border-border/60 px-5 py-4">
              <SheetTitle>Configurações do artigo</SheetTitle>
              <SheetDescription className="sr-only">
                Capa, autor, categoria, destinos e publicação.
              </SheetDescription>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{settings}</div>
          </SheetContent>
        </Sheet>
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
