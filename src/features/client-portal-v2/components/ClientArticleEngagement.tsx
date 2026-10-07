import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Heart, MessageCircle, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import {
  addArtigoComentarioSession,
  loadArtigoEngagementSession,
  toggleArtigoLikeSession,
} from "@/lib/portal-auth.functions";
import { colorFor, initialsOf, type BlogEngagement } from "@/lib/blog-engagement";
import {
  COMMENT_MAX,
  newestFirst,
  normalizeComment,
  pendingComment,
  pluralize,
  relativeTime,
  toggleLikeOptimistic,
} from "../lib/artigo-engagement";

/** Curtir + comentários do leitor. Usa as funções de sessão existentes (a posse do artigo e o papel
 * `client_viewer` são revalidados no servidor). O artigo aparece primeiro; isto carrega depois. */
export function ClientArticleEngagement({ postId }: { postId: string }) {
  const { data, readOnly } = usePortalSessionData();
  const loadFn = useServerFn(loadArtigoEngagementSession);
  const likeFn = useServerFn(toggleArtigoLikeSession);
  const commentFn = useServerFn(addArtigoComentarioSession);

  const [eng, setEng] = useState<BlogEngagement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeError, setLikeError] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const currentPost = useRef(postId);
  const listRef = useRef<HTMLUListElement>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const next = await loadFn({ data: { postId } });
      if (currentPost.current === postId) setEng(next);
    } catch {
      if (currentPost.current === postId) setLoadError(true);
    }
  }, [loadFn, postId]);

  useEffect(() => {
    currentPost.current = postId;
    setEng(null);
    setDraft("");
    setSendError(null);
    setLikeError(false);
    void load();
  }, [postId, load]);

  const toggleLike = async () => {
    if (!eng || likeBusy || readOnly) return;
    const before = eng;
    setLikeBusy(true);
    setLikeError(false);
    setEng(toggleLikeOptimistic(before));
    try {
      await likeFn({ data: { postId } });
    } catch {
      setEng(before);
      setLikeError(true);
    } finally {
      setLikeBusy(false);
    }
  };

  const submit = async () => {
    const body = normalizeComment(draft);
    if (!body || sending || !eng || readOnly) return;
    setSending(true);
    setSendError(null);
    const before = eng;
    setEng({
      ...eng,
      comments: [...eng.comments, pendingComment(body, data.clienteNome, new Date().toISOString())],
    });
    setDraft("");
    listRef.current?.scrollTo({ top: 0 });
    try {
      await commentFn({ data: { postId, body } });
      await load();
    } catch {
      setEng(before);
      setDraft(body);
      setSendError("Não foi possível enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  return (
    <EngagementView
      eng={eng}
      loadError={loadError}
      likeBusy={likeBusy}
      likeError={likeError}
      draft={draft}
      sending={sending}
      sendError={sendError}
      readOnly={readOnly}
      clienteNome={data.clienteNome}
      clienteFoto={data.clienteFoto}
      listRef={listRef}
      onToggleLike={() => void toggleLike()}
      onDraft={setDraft}
      onSubmit={() => void submit()}
      onRetry={() => void load()}
    />
  );
}

export type EngagementViewProps = {
  eng: BlogEngagement | null;
  loadError: boolean;
  likeBusy: boolean;
  likeError: boolean;
  draft: string;
  sending: boolean;
  sendError: string | null;
  readOnly: boolean;
  clienteNome: string;
  clienteFoto?: string;
  listRef?: RefObject<HTMLUListElement | null>;
  onToggleLike: () => void;
  onDraft: (v: string) => void;
  onSubmit: () => void;
  onRetry: () => void;
};

/** Apresentação pura do painel (sem hooks de dados) — facilita teste e revisão visual. */
export function EngagementView({
  eng,
  loadError,
  likeBusy,
  likeError,
  draft,
  sending,
  sendError,
  readOnly,
  clienteNome,
  clienteFoto,
  listRef,
  onToggleLike,
  onDraft,
  onSubmit,
  onRetry,
}: EngagementViewProps) {
  const comments = eng ? newestFirst(eng.comments) : [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 px-5 pt-5 md:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Engajamento
        </p>
        {eng ? (
          <>
            <p className="text-sm text-text-secondary" aria-live="polite">
              {pluralize(eng.likeCount, "curtida", "curtidas")} ·{" "}
              {pluralize(eng.comments.length, "comentário", "comentários")}
            </p>
            <button
              type="button"
              onClick={() => onToggleLike()}
              disabled={likeBusy || readOnly}
              aria-pressed={eng.likedByMe}
              aria-label={eng.likedByMe ? "Remover curtida" : "Curtir este conteúdo"}
              className={`inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60 ${
                eng.likedByMe
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
                  : "border-input text-foreground hover:bg-muted"
              }`}
            >
              <Heart className={`h-4 w-4 ${eng.likedByMe ? "fill-current" : ""}`} />
              {eng.likedByMe ? "Curtido" : "Curtir"}
            </button>
            {likeError && (
              <p role="alert" className="text-xs text-destructive">
                Não foi possível registrar a curtida.
              </p>
            )}
          </>
        ) : loadError ? (
          <div role="alert" className="space-y-2 text-sm text-text-secondary">
            <p>Não foi possível carregar as interações.</p>
            <button
              type="button"
              onClick={() => onRetry()}
              className="cursor-pointer text-xs font-medium text-foreground underline underline-offset-2"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-border/60">
        <p className="shrink-0 px-5 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Comentários
        </p>
        <div className="min-h-0 flex-1 md:overflow-y-auto">
          {!eng ? (
            loadError ? null : (
              <div className="space-y-3 px-5" aria-busy="true">
                {[0, 1].map((i) => (
                  <div key={i} className="flex gap-2.5">
                    <Skeleton className="h-7 w-7 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : comments.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-text-secondary">
              Ainda não há comentários. Seja o primeiro a comentar.
            </p>
          ) : (
            <ul ref={listRef} className="divide-y divide-border/50 px-5 pb-4">
              {comments.map((c) => {
                const own = c.authorKind === "cliente";
                return (
                  <li key={c.id} className="flex gap-2.5 py-3 first:pt-0">
                    <Avatar className="h-7 w-7 shrink-0">
                      {own && clienteFoto && c.authorLabel === clienteNome && (
                        <AvatarImage src={clienteFoto} alt="" />
                      )}
                      <AvatarFallback
                        className={`text-[11px] font-semibold ${colorFor(c.authorLabel)}`}
                      >
                        {initialsOf(c.authorLabel) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-1.5 text-xs">
                        <span className="truncate font-semibold text-foreground">
                          {c.authorLabel}
                        </span>
                        <span className="shrink-0 text-text-secondary">
                          {c.id.startsWith("pending:") ? "enviando…" : relativeTime(c.createdAt)}
                        </span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground [overflow-wrap:anywhere]">
                        {c.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <form
        className="shrink-0 border-t border-border/60 bg-background px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {readOnly ? (
          <p className="text-xs text-text-secondary">Seu acesso é somente leitura.</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => onDraft(e.target.value)}
                maxLength={COMMENT_MAX}
                aria-label="Escreva um comentário"
                placeholder="Escreva um comentário..."
                disabled={!eng || sending}
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!eng || sending || !normalizeComment(draft)}
                aria-label="Enviar comentário"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md bg-foreground text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            {sendError && (
              <p role="alert" className="mt-1.5 text-xs text-destructive">
                {sendError}
              </p>
            )}
          </>
        )}
      </form>
    </div>
  );
}

/** Barra fixa inferior do mobile: curtir/ir para comentários sem sair do artigo. */
export function MobileEngagementHint() {
  return (
    <a
      href="#artigo-engajamento"
      onClick={(e) => {
        e.preventDefault();
        document.getElementById("artigo-engajamento")?.scrollIntoView({ behavior: "smooth" });
      }}
      className="sticky bottom-0 z-10 flex items-center justify-center gap-2 border-t border-border/60 bg-background/95 py-2.5 text-sm font-medium text-text-secondary backdrop-blur md:hidden"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      Curtidas e comentários
    </a>
  );
}
