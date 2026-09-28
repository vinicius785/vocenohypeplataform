import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteMessage, type ChatMember, type ChatMessage } from "@/lib/chat-store";
import { ChatV2Message } from "./ChatV2Message";
import { ChatV2Composer } from "./ChatV2Composer";

/** Painel lateral de thread — 1 nível (respostas a uma mensagem raiz), como
 * o resto do chat já suporta via `replyToId`. Em desktop é um painel de
 * ~400px ao lado da conversa; a rota que usa este componente é responsável
 * por, no mobile, renderizá-lo como tela cheia em vez de painel lateral
 * (ver `chat-v2.$kind.$id.tsx`). */
export function ChatV2ThreadPanel({
  rootMessage,
  messages,
  meId,
  members,
  onClose,
}: {
  rootMessage: ChatMessage;
  messages: ChatMessage[];
  meId: string;
  members: ChatMember[];
  onClose: () => void;
}) {
  const replies = useMemo(
    () =>
      messages
        .filter((m) => m.replyToId === rootMessage.id)
        .sort((a, b) => a.createdAt - b.createdAt),
    [messages, rootMessage.id],
  );

  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-background md:w-[400px]">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Thread</p>
          <p className="text-[11px] text-muted-foreground">
            {replies.length} resposta{replies.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar thread">
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto py-2">
        <ChatV2Message
          message={rootMessage}
          showHeader
          meId={meId}
          members={members}
          onReply={() => {}}
          onDelete={(id) => void deleteMessage(id)}
        />
        <div className="my-2 border-t border-border" />
        {replies.map((m, i) => (
          <ChatV2Message
            key={m.id}
            message={m}
            showHeader={i === 0 || replies[i - 1].authorId !== m.authorId}
            meId={meId}
            members={members}
            onReply={() => {}}
            onDelete={(id) => void deleteMessage(id)}
          />
        ))}
        {replies.length === 0 && (
          <p className="px-4 py-4 text-center text-xs text-muted-foreground">
            Nenhuma resposta ainda.
          </p>
        )}
      </div>
      <ChatV2Composer convoId={rootMessage.convoId} replyToId={rootMessage.id} />
    </div>
  );
}
