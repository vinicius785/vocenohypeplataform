import { useEffect, useRef, useState, type ReactNode } from "react";
import { Heart, MessageCircle, Send, Trash2 } from "lucide-react";
import type { BlogComment } from "@/lib/blog-engagement";
import { initialsOf, colorFor } from "@/lib/blog-engagement";
import { renderMentions, type Member } from "@/components/tasks/TaskBoard";
import { useConfirm } from "@/hooks/use-confirm";
import { MARKDOWN_LITE_CLASSES } from "./markdown";

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
type ArticleEngagementProps = {
  likeCount: number;
  likedByMe: boolean;
  comments: BlogComment[];
  onToggleLike: () => void;
  onAddComment: (body: string) => void | Promise<void>;
  commentPlaceholder?: string;
  /** Pessoas mencionáveis via "@" no comentário — só passado pelo Mural
   * interno (`InicioDashboard.tsx`); o Portal do cliente nunca recebe
   * isso, então o cliente nunca vê nem menciona a equipe interna. Quando
   * ausente, o campo continua um comentário simples, sem dropdown de
   * @menção — comportamento idêntico ao de antes desta funcionalidade. */
  mentionMembers?: Member[];
  /** Exclui um comentário — só passado pelo Mural interno; ausente, o
   * botão de excluir nem aparece (Portal do cliente continua sem essa
   * ação, como sempre foi). */
  onDeleteComment?: (commentId: string) => void | Promise<void>;
};

/** Painel de curtir/comentar no formato "cartão lateral" do LinkedIn:
 * resumo de reações, linha de ações (Curtir/Comentar), caixa de novo
 * comentário e a lista — usado dentro de `ArticleReader`. */
function ArticleCommentsPanel({
  likeCount,
  likedByMe,
  comments,
  onToggleLike,
  onAddComment,
  commentPlaceholder = "Adicionar comentário...",
  mentionMembers,
  onDeleteComment,
}: ArticleEngagementProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();

  const handleDelete = async (comment: BlogComment) => {
    if (!onDeleteComment) return;
    const ok = await confirm(`Excluir o comentário de ${comment.authorLabel}?`);
    if (!ok) return;
    setDeletingId(comment.id);
    try {
      await onDeleteComment(comment.id);
    } finally {
      setDeletingId(null);
    }
  };

  // @menção (item pedido pelo usuário) — mesma lógica de detecção/
  // inserção de `TaskActivityPanel.tsx`, só adaptada de `<textarea>` pra
  // `<input>` de uma linha. Só ativa quando `mentionMembers` é passado
  // (Mural interno); no Portal do cliente (sem a prop) fica como sempre
  // foi, um campo simples.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  useEffect(() => {
    if (!draft) setMentionQuery(null);
  }, [draft]);
  const mentionMatches =
    mentionMembers && mentionQuery !== null
      ? mentionMembers
          .filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 5)
      : [];
  const onDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setDraft(v);
    if (!mentionMembers) return;
    const caret = e.target.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\wÀ-ÿ]*)$/);
    setMentionQuery(m ? m[1] : null);
  };
  const insertMention = (name: string) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@([\wÀ-ÿ]*)$/, `@${name} `);
    const after = draft.slice(caret);
    setDraft(before + after);
    setMentionQuery(null);
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    }, 0);
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onAddComment(body);
      setDraft("");
      setMentionQuery(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      {confirmDialog}
      <h3 className="text-sm font-semibold">Comentários</h3>

      {(likeCount > 0 || comments.length > 0) && (
        <div className="flex items-center gap-3 border-b border-border pb-3 text-[11px] text-muted-foreground">
          {likeCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3 fill-rose-500 text-rose-500" /> {likeCount}
            </span>
          )}
          {comments.length > 0 && (
            <span>
              {comments.length} comentário{comments.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      <div className="-mx-1 flex items-center border-b border-border pb-3">
        <button
          type="button"
          onClick={onToggleLike}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
            likedByMe ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Heart className={`h-4 w-4 ${likedByMe ? "fill-current" : ""}`} /> Gostei
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <MessageCircle className="h-4 w-4" /> Comentar
        </button>
      </div>

      <div className="relative flex items-center gap-2">
        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-0 right-11 mb-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
            {mentionMatches.map((m) => (
              <button
                key={m.name}
                type="button"
                onClick={() => insertMention(m.name)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${colorFor(m.name)}`}
                >
                  {initialsOf(m.name) || "?"}
                </span>
                {m.name}
              </button>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          value={draft}
          onChange={onDraftChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder={
            mentionMembers ? `${commentPlaceholder} (use @ para mencionar)` : commentPlaceholder
          }
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

      {comments.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <MessageCircle className="h-6 w-6 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
          <p className="text-[11px] text-muted-foreground">Seja a primeira pessoa a comentar.</p>
        </div>
      ) : (
        <ul className="max-h-96 space-y-3 overflow-y-auto">
          {comments.map((c) => (
            <li key={c.id} className="group flex gap-2.5">
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
                  {onDeleteComment && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(c)}
                      disabled={deletingId === c.id}
                      aria-label={`Excluir comentário de ${c.authorLabel}`}
                      className="ml-auto shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-foreground [overflow-wrap:anywhere]">
                  {mentionMembers ? renderMentions(c.body, mentionMembers) : c.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Tela de leitura de um artigo publicado — mesma estrutura no Mural
 * interno (`InicioDashboard.tsx`) e no Portal do cliente
 * (`portal.$token.tsx`): capa em destaque com legenda "Por: autor", título,
 * byline, conteúdo, e um cartão de comentários ao lado (estilo LinkedIn),
 * que empilha abaixo do conteúdo em telas estreitas. */
export function ArticleReader({
  cover,
  category,
  title,
  authorLabel,
  authorPhoto,
  metaExtra,
  dateLabel,
  contentHtml,
  engagement,
  headerExtra,
}: {
  cover?: string;
  category?: string;
  title: string;
  authorLabel: string;
  authorPhoto?: string;
  /** Info extra na linha de autor, ex. nome do projeto no Mural interno. */
  metaExtra?: string;
  dateLabel?: string;
  contentHtml: string;
  engagement: ArticleEngagementProps;
  /** Slot livre acima do título (ex.: botão Voltar do Portal). */
  headerExtra?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_320px] md:items-start">
      <article className="min-w-0">
        {headerExtra}
        {cover && (
          <>
            <img src={cover} alt="" className="aspect-video w-full rounded-xl object-cover" />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">Por: {authorLabel}</p>
          </>
        )}
        {(category || metaExtra) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {category && (
              <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {category}
              </span>
            )}
            {/* Contexto do artigo (ex.: projeto de onde ele veio) — separado
             * da linha de autor de propósito, senão parece cargo da pessoa
             * ("Fulano · Marketing" lia como se "Marketing" fosse o cargo). */}
            {metaExtra && (
              <span className="text-[11px] text-muted-foreground">Publicado em {metaExtra}</span>
            )}
          </div>
        )}
        <h1 className="mt-2 text-2xl font-light leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {authorPhoto ? (
            <img src={authorPhoto} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ${colorFor(authorLabel)}`}
            >
              {initialsOf(authorLabel) || "?"}
            </span>
          )}
          <span className="font-medium text-foreground">{authorLabel}</span>
          {dateLabel && <span>· {dateLabel}</span>}
        </div>
        <div
          className={`mt-6 ${MARKDOWN_LITE_CLASSES}`}
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      </article>
      <aside className="md:sticky md:top-4">
        <ArticleCommentsPanel {...engagement} />
      </aside>
    </div>
  );
}
