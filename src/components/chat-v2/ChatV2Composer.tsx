import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Paperclip, Send, SmilePlus, X } from "lucide-react";
import {
  broadcastTyping,
  sendMessage,
  uploadChatAttachment,
  REACTION_EMOJIS,
  loadMembers,
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
import {
  useMentions,
  extractUsedMentions,
  MentionTextarea,
} from "@/components/chat/MentionTextarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VoiceRecorderBar } from "@/components/chat/VoiceRecorderBar";
import { computeComposerPlaceholder } from "./composer-placeholder";

/** Fonte das opções de @menção do composer — mesmos 5 tipos do Chat V1
 * (pessoa/tarefa/projeto/campanha/cliente), reaproveitando `useMentions`/
 * `MentionTextarea` (extraídos de `ChatSection.tsx`) em vez de duplicar a
 * lógica. Sem `MentionContext` de ranking por enquanto (o card de
 * relevância por canal/DM do V1 fica pra uma rodada futura) — a busca e
 * a navegação por tipo já funcionam iguais. */
function useV2MentionOptions() {
  const members = loadMembers();
  const tasks = useTaskDirectory();
  const clientes = useClientes();
  const projects = useMemo<MentionOption[]>(
    () =>
      loadProjetos().map((p) => ({ kind: "project", id: p.id, label: p.name, hint: "Projeto" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks],
  );
  const campaigns = useMemo<MentionOption[]>(() => {
    const out: MentionOption[] = [];
    for (const c of clientes) {
      for (const camp of c.campanhas ?? []) {
        out.push({
          kind: "campaign",
          id: camp.id,
          label: camp.nome,
          photo: c.photo,
          hint: `Campanha · ${c.empresa}`,
          clienteId: c.id,
        });
      }
    }
    return out;
  }, [clientes]);
  const clientOptions = useMemo<MentionOption[]>(
    () =>
      clientes.map((c) => ({
        kind: "client",
        id: c.id,
        label: c.empresa,
        photo: c.photo,
        hint: "Cliente",
      })),
    [clientes],
  );
  return useMentions(members, tasks, projects, campaigns, clientOptions, true);
}

export function ChatV2Composer({
  convoId,
  replyToId,
  onSent,
  conversationLabel,
}: {
  convoId: string;
  replyToId?: string;
  onSent?: () => void;
  /** Nome da conversa (pessoa da DM, #canal, campanha) — vira o placeholder
   * contextual ("Mensagem para X"). Sem isso (ou dentro de uma thread, que
   * tem seu próprio placeholder fixo), cai num texto genérico. */
  conversationLabel?: string;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; uploading: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const mentionOptions = useV2MentionOptions();
  const placeholder = computeComposerPlaceholder({ replyToId, conversationLabel });

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
    void loadDraftFromDb(convoId).then((dbDraft) => {
      if (!cancelled) setText(dbDraft);
    });
    return () => {
      cancelled = true;
    };
  }, [convoId]);

  // Debounce de ~1s antes de persistir o rascunho — evita gravar a cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => {
      void saveDraftToDb(convoId, text);
    }, 1000);
    return () => window.clearTimeout(t);
  }, [convoId, text]);

  // Publica a própria altura numa CSS custom property — é o que permite o
  // botão flutuante "Encontrou um bug?" (`BugReportButton.tsx`) nunca
  // sobrepor o composer, mesmo quando ele cresce com o texto, SEM chutar
  // nenhum valor fixo de `bottom` (o composer pode ir de ~92px até
  // ~290px de altura com uma mensagem longa).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const set = () =>
      document.documentElement.style.setProperty(
        "--chat-v2-composer-height",
        `${el.getBoundingClientRect().height}px`,
      );
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--chat-v2-composer-height");
    };
  }, [voiceMode, pendingFiles.length]);

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
      const mentions: ChatMention[] = extractUsedMentions(trimmed, mentionOptions);
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
      onSent?.();
    } finally {
      setSending(false);
    }
  };

  const iconButtonClass =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <div ref={rootRef} className="shrink-0 border-t border-border px-3 pb-3 pt-2.5 md:px-4">
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
        <div className="flex min-h-[92px] flex-col rounded-lg border border-border bg-background transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-border/70 px-3 pt-2.5">
              {pendingFiles.map((pf, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                >
                  <span className="max-w-[160px] truncate">{pf.file.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
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
          <MentionTextarea
            ref={textareaRef}
            value={text}
            onChange={(v) => {
              setText(v);
              broadcastTyping(convoId);
            }}
            options={mentionOptions}
            onEnterSubmit={() => void handleSend()}
            placeholder={placeholder}
            rows={1}
            className="block max-h-[240px] min-h-[44px] w-full resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-left text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="flex shrink-0 items-center gap-0.5 px-1.5 pb-1.5">
            <label className={`cursor-pointer ${iconButtonClass}`} title="Anexar arquivo">
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
                <button type="button" aria-label="Inserir emoji" className={iconButtonClass}>
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
              className={iconButtonClass}
            >
              <Mic className="h-4 w-4" />
            </button>
            <Button
              size="icon"
              className="ml-auto h-8 w-8 shrink-0"
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
  );
}
