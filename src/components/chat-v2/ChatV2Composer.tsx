import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import {
  broadcastTyping,
  sendMessage,
  uploadChatAttachment,
  type ChatAttachment,
} from "@/lib/chat-store";
import { Button } from "@/components/ui/button";
import { getDraft, setDraft } from "./chat-v2-utils";

export function ChatV2Composer({
  convoId,
  replyToId,
  onSent,
}: {
  convoId: string;
  replyToId?: string;
  onSent?: () => void;
}) {
  const [text, setText] = useState(() => getDraft(convoId));
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; uploading: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Trocar de conversa não apaga o rascunho — cada conversa tem o seu.
  useEffect(() => {
    setText(getDraft(convoId));
    setError(null);
  }, [convoId]);

  useEffect(() => {
    setDraft(convoId, text);
  }, [convoId, text]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text]);

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
      const result = await sendMessage({ convoId, text: trimmed, attachments, replyToId });
      if (!result) {
        setError("Falha ao enviar. Tente novamente.");
        return;
      }
      setText("");
      setDraft(convoId, "");
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
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            broadcastTyping(convoId);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Escreva uma mensagem…"
          rows={1}
          className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
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
    </div>
  );
}
