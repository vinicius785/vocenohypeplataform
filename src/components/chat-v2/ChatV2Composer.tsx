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
}: {
  convoId: string;
  replyToId?: string;
  onSent?: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; uploading: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionOptions = useV2MentionOptions();

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

  return (
    <div className="border-t border-border px-4 py-3">
      {error && (
        <p className="mb-2 text-xs text-destructive">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void handleSend()}>
            Tentar novamente
          </button>
        </p>
      )}
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingFiles.map((pf, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
            >
              <span className="max-w-[160px] truncate">{pf.file.name}</span>
              <button
                type="button"
                aria-label="Remover anexo"
                onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
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
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
          <label className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <SmilePlus className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="flex w-auto gap-0.5 p-1">
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Mic className="h-4 w-4" />
          </button>
          <MentionTextarea
            ref={textareaRef}
            value={text}
            onChange={(v) => {
              setText(v);
              broadcastTyping(convoId);
            }}
            options={mentionOptions}
            onEnterSubmit={() => void handleSend()}
            placeholder="Escreva uma mensagem…"
            rows={1}
            className="max-h-[200px] min-h-[28px] flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={sending || (!text.trim() && pendingFiles.length === 0)}
            onClick={() => void handleSend()}
            aria-label="Enviar mensagem"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
