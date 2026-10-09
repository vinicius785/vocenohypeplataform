import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Paperclip, Reply, Send, SmilePlus, X } from "lucide-react";
import { CHAT_V2_READING_COLUMN_CLASS } from "./chat-v2-utils";
import {
  broadcastTyping,
  sendMessage,
  uploadChatAttachment,
  REACTION_EMOJIS,
  loadMembers,
  loadChannels,
  loadMessages,
  getMe,
  loadDraftFromDb,
  saveDraftToDb,
  deleteDraftFromDb,
  type ChatAttachment,
  type ChatMention,
} from "@/lib/chat-store";
import { useClientes } from "@/lib/clientes-store";
import { loadProjetos } from "@/lib/projetos";
import { useTaskDirectory } from "@/lib/task-directory";
import type { MentionOption } from "@/lib/mention-kinds";
import { extractUsedMentions, MentionTextarea } from "@/components/chat/MentionTextarea";
import {
  canMentionPeople,
  eligibleMentionMembers,
  expandEveryoneMention,
  sanitizeMentionsForConversation,
} from "@/lib/chat-mentions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VoiceRecorderBar } from "@/components/chat/VoiceRecorderBar";
import { TaskRefChip } from "@/components/chat/TaskRefChip";
import { computeComposerPlaceholder } from "./composer-placeholder";

/** Fontes do composer, separadas por responsabilidade:
 *  - `@` → MENÇÃO: só pessoas elegíveis desta conversa (nenhuma em conversa direta);
 *  - `#` → REFERÊNCIA a tarefa/projeto/campanha/cliente (qualquer conversa). */
function useV2MentionSources(convoId: string) {
  const members = loadMembers();
  const channels = loadChannels();
  const tasks = useTaskDirectory();
  const clientes = useClientes();
  const meId = getMe().id;
  const meName = getMe().name.trim().toLowerCase();

  const mentionsEnabled = canMentionPeople(convoId);
  const people = useMemo(
    () => eligibleMentionMembers({ convoId, members, channels, meId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convoId, members.length, channels, meId],
  );

  // Pessoas que falaram há pouco nesta conversa (mais recente primeiro) — prioridade quando só se
  // digita "@". Usa as mensagens que o Chat já tem em memória; nada novo é consultado.
  const recentUserIds = useMemo(() => {
    if (!mentionsEnabled) return [];
    const ids: string[] = [];
    const msgs = loadMessages();
    for (let i = msgs.length - 1; i >= 0 && ids.length < 12; i--) {
      const m = msgs[i];
      if (m.convoId === convoId && m.authorId !== meId && !ids.includes(m.authorId)) {
        ids.push(m.authorId);
      }
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convoId, mentionsEnabled, meId]);

  const references = useMemo<MentionOption[]>(() => {
    const t: MentionOption[] = tasks.map((x) => ({
      kind: "task",
      id: x.id,
      label: x.label?.trim() || "Tarefa sem título",
      hint: x.project ? `Projeto: ${x.project}` : undefined,
      status: x.status,
      assigneeIds: x.assignees,
      // Sem busca, as minhas tarefas ativas aparecem primeiro (depois as demais ativas).
      boost:
        (x.assignees?.some((a) => a === meId || a.trim().toLowerCase() === meName) ? 50 : 0) +
        (x.status === "Concluído" || x.status === "Arquivado" || x.status === "Aprovado" ? 0 : 10),
      campanhaId: x.campanhaId,
      projectId: x.projectId,
    }));
    const projects: MentionOption[] = loadProjetos().map((p) => ({
      kind: "project",
      id: p.id,
      label: p.name,
      hint: "Projeto",
    }));
    const campaigns: MentionOption[] = [];
    const clientOptions: MentionOption[] = [];
    for (const c of clientes) {
      clientOptions.push({
        kind: "client",
        id: c.id,
        label: c.empresa,
        photo: c.photo,
        hint: "Cliente",
      });
      for (const camp of c.campanhas ?? []) {
        campaigns.push({
          kind: "campaign",
          id: camp.id,
          label: camp.nome,
          photo: c.photo,
          hint: `Campanha · ${c.empresa}`,
          clienteId: c.id,
        });
      }
    }
    // Rótulo vazio quebraria a busca e inseriria "#undefined": nunca entra.
    return [...t, ...projects, ...campaigns, ...clientOptions].filter(
      (o) => typeof o.label === "string" && o.label.trim() !== "",
    );
  }, [tasks, clientes, meId, meName]);

  return { people, references, recentUserIds, mentionsEnabled };
}

export function ChatV2Composer({
  convoId,
  replyToId,
  onSent,
  conversationLabel,
  replyPreview,
  onCancelReply,
  isThread,
}: {
  convoId: string;
  replyToId?: string;
  onSent?: () => void;
  /** Nome da conversa (pessoa da DM, #canal, campanha) — vira o placeholder
   * contextual ("Mensagem para X"). Sem isso (ou dentro de uma thread, que
   * tem seu próprio placeholder fixo), cai num texto genérico. */
  conversationLabel?: string;
  /** Resposta inline (item 9 do pedido) — mostra "Respondendo a X / trecho"
   * ACIMA do composer, com botão cancelar, antes de enviar. Só usado pela
   * timeline principal (`ChatV2ConversationPane`); dentro do painel de
   * thread o contexto já é a mensagem raiz mostrada no topo do painel, então
   * não é passado ali. */
  replyPreview?: { authorName: string; text: string };
  onCancelReply?: () => void;
  /** true quando este composer é o do `ChatV2ThreadPanel` — muda o
   * placeholder fixo ("Responder nesta thread") em vez do contextual. */
  isThread?: boolean;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; uploading: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { people, references, recentUserIds, mentionsEnabled } = useV2MentionSources(convoId);
  // Tarefas citadas com `#` no texto: aparecem como objeto (status + título + responsável).
  const usedTasks = useMemo(
    () => references.filter((o) => o.kind === "task" && text.includes("#" + o.label)).slice(0, 4),
    [references, text],
  );
  const placeholder = computeComposerPlaceholder({ replyToId, conversationLabel, isThread });

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((t) => t + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // Trocar de conversa não apaga o rascunho — cada conversa tem o seu.
  // Fonte de verdade é a tabela `chat_drafts` (sincroniza entre abas e
  // dispositivos); carregado ao montar/trocar de conversa.
  useEffect(() => {
    setText("");
    setError(null);
    let cancelled = false;
    savedTextRef.current = "";
    void loadDraftFromDb(convoId).then((dbDraft) => {
      if (cancelled) return;
      savedTextRef.current = dbDraft;
      setText(dbDraft);
    });
    return () => {
      cancelled = true;
    };
  }, [convoId]);

  // Debounce de ~1s antes de persistir o rascunho — evita gravar a cada tecla.
  const textRef = useRef(text);
  textRef.current = text;
  const savedTextRef = useRef("");
  useEffect(() => {
    const t = window.setTimeout(() => {
      savedTextRef.current = text;
      void saveDraftToDb(convoId, text);
    }, 1000);
    return () => window.clearTimeout(t);
  }, [convoId, text]);
  // Sair da conversa (ou desmontar o composer) dentro do 1s do debounce NÃO perde o que foi digitado:
  // grava na hora o que ainda não foi salvo. Roda só ao trocar de conversa/desmontar.
  useEffect(() => {
    return () => {
      if (textRef.current !== savedTextRef.current) {
        void saveDraftToDb(convoId, textRef.current);
      }
    };
  }, [convoId]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && pendingFiles.length === 0) || sending) return;
    setSending(true);
    setError(null);
    try {
      const attachments: ChatAttachment[] = [];
      for (const pf of pendingFiles) {
        const uploaded = await uploadChatAttachment(pf.file);
        if (uploaded) attachments.push(uploaded);
      }
      // Normalização central: em conversa direta nenhuma menção de PESSOA sobrevive.
      const mentions: ChatMention[] = sanitizeMentionsForConversation(
        convoId,
        expandEveryoneMention(
          extractUsedMentions(trimmed, people, references, {
            includeEveryone: mentionsEnabled && people.length > 1,
          }),
          people.map((p) => p.id),
        ),
      );
      const result = await sendMessage({
        convoId,
        text: trimmed,
        mentions,
        attachments,
        replyToId,
      });
      if (!result) {
        setError("Falha ao enviar. Tente novamente.");
        return;
      }
      setText("");
      void deleteDraftFromDb(convoId);
      setPendingFiles([]);
      onCancelReply?.();
      onSent?.();
    } finally {
      setSending(false);
    }
  };

  const iconButtonClass =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    // `bg-muted/20` (não `bg-background`) de propósito: mesmo token de
    // superfície já usado pela coluna de conversas (`ChatV2Navigation.tsx`)
    // — antes o composer usava exatamente a mesma cor de fundo da timeline
    // (`bg-background`), zero hierarquia entre as camadas do chat.
    // Faixa externa (`bg-muted/20`) ocupa 100% da largura do painel — é só o
    // fundo/camada visual. O CONTEÚDO do composer (banner de resposta,
    // campo, toolbar) fica dentro de `CHAT_V2_READING_COLUMN_CLASS`, a
    // MESMA classe usada pela timeline (`ChatV2Timeline.tsx`) — é isso que
    // garante que timeline e composer compartilhem exatamente a mesma
    // largura/alinhamento (item 1+11 do pedido), em vez de o composer se
    // esticar por todo o painel enquanto a timeline fica numa coluna.
    <div ref={rootRef} className="min-w-0 shrink-0 border-t border-border bg-muted/20">
      <div
        className={`pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:pb-3 md:pt-2.5 ${CHAT_V2_READING_COLUMN_CLASS}`}
      >
        {replyPreview && (
          <div className="mb-1.5 flex items-start gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1.5">
            <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">
                Respondendo a {replyPreview.authorName}
              </p>
              <p className="truncate text-xs text-muted-foreground">{replyPreview.text}</p>
            </div>
            <button
              type="button"
              aria-label="Cancelar resposta"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onCancelReply?.()}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {error && (
          <p className="mb-1.5 text-xs text-destructive">
            {error}{" "}
            <button type="button" className="underline" onClick={() => void handleSend()}>
              Tentar novamente
            </button>
          </p>
        )}
        {voiceMode ? (
          <VoiceRecorderBar
            convoId={convoId}
            replyToId={replyToId}
            onDone={() => setVoiceMode(false)}
            onSent={() => {
              setVoiceMode(false);
              onSent?.();
            }}
          />
        ) : (
          // Duas áreas empilhadas (padrão Slack): texto em cima usando 100%
          // da largura, toolbar de ações no rodapé — nunca os ícones dentro
          // da MESMA linha flex do textarea, que era o que forçava a área
          // digitável a dividir espaço com 3 botões e nunca ocupar a largura
          // real disponível.
          // Mobile: UMA linha compacta [anexo][campo que cresce][voz][enviar] (a toolbar usa `contents` para os
          // botões virarem itens da mesma linha). Desktop: campo em cima e toolbar embaixo, como antes.
          <div className="flex flex-wrap items-end gap-x-0.5 rounded-lg border border-border bg-background px-1 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 md:min-h-[92px] md:flex-col md:flex-nowrap md:items-stretch md:gap-x-0 md:px-0">
            {pendingFiles.length > 0 && (
              <div className="flex basis-full flex-wrap gap-1.5 border-b border-border/70 px-2 py-2 md:px-3 md:pb-0 md:pt-2.5">
                {pendingFiles.map((pf, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                  >
                    <span className="max-w-[160px] truncate">{pf.file.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {(pf.file.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover anexo ${pf.file.name}`}
                      onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {usedTasks.length > 0 && (
              <div
                className="flex basis-full flex-wrap gap-1 px-2 pt-2 md:px-3"
                aria-label="Tarefas referenciadas"
              >
                {usedTasks.map((o) => (
                  <TaskRefChip
                    key={o.id}
                    title={o.label}
                    status={o.status}
                    project={o.hint?.replace(/^Projeto:\s*/, "")}
                    assignees={o.assigneeIds}
                    onRemove={() =>
                      setText((t) => t.replace("#" + o.label + " ", "").replace("#" + o.label, ""))
                    }
                  />
                ))}
              </div>
            )}
            <MentionTextarea
              ref={textareaRef}
              value={text}
              onChange={(v) => {
                setText(v);
                broadcastTyping(convoId);
              }}
              people={people}
              mentionsEnabled={mentionsEnabled}
              references={references}
              recentUserIds={recentUserIds}
              onEnterSubmit={() => void handleSend()}
              placeholder={placeholder}
              rows={1}
              wrapperClassName="relative order-2 min-w-0 flex-1 md:order-none"
              className="block max-h-[min(calc(var(--app-h,100dvh)*0.4),240px)] min-h-[44px] w-full resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-left text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground md:px-3 md:text-sm"
            />
            <div className="contents md:flex md:shrink-0 md:items-center md:gap-0.5 md:px-1.5 md:pb-1.5">
              <label
                className={`order-1 mb-1 cursor-pointer md:order-none md:mb-0 ${iconButtonClass} max-md:h-10 max-md:w-10`}
                title="Anexar arquivo"
              >
                <Paperclip className="h-4 w-4" />
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    setPendingFiles((prev) => [
                      ...prev,
                      ...files.map((file) => ({ file, uploading: false })),
                    ]);
                    e.target.value = "";
                  }}
                />
              </label>
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Inserir emoji"
                    className={`hidden md:flex ${iconButtonClass}`}
                  >
                    <SmilePlus className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  collisionPadding={12}
                  avoidCollisions
                  className="flex w-auto gap-0.5 p-1"
                >
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="rounded p-1 text-lg hover:bg-muted"
                      onClick={() => insertEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => setVoiceMode(true)}
                aria-label="Gravar mensagem de voz"
                title="Gravar mensagem de voz"
                className={`order-3 mb-1 md:order-none md:mb-0 ${iconButtonClass} max-md:h-10 max-md:w-10`}
              >
                <Mic className="h-4 w-4" />
              </button>
              <Button
                size="icon"
                className="order-4 mb-1 h-10 w-10 shrink-0 md:order-none md:mb-0 md:ml-auto md:h-8 md:w-8"
                // Não tira o foco do campo: o teclado fica aberto após enviar (padrão de apps de mensagem).
                onPointerDown={(e) => e.preventDefault()}
                disabled={sending || (!text.trim() && pendingFiles.length === 0)}
                onClick={() => void handleSend()}
                aria-label="Enviar mensagem"
                title="Enviar mensagem"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
