import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { deleteMessage, type ChatMember, type ChatMessage } from "@/lib/chat-store";
import { ChatV2Message } from "./ChatV2Message";
import { ChatV2Composer } from "./ChatV2Composer";

const NEAR_BOTTOM_PX = 120;

/** Painel de thread (1 nível: respostas a uma mensagem raiz via `replyToId`). Estrutura fixa em 3
 * linhas — cabeçalho, conversa (a ÚNICA que rola) e composer —, para o composer nunca rolar junto.
 * A largura e o modo (ao lado do chat, camada sobre ele ou tela cheia no celular) são decididos
 * pelo contêiner em `ChatV2ConversationPane`; aqui o painel só preenche o espaço que recebe. */
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
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);
  const replies = useMemo(
    () =>
      messages
        .filter((m) => m.replyToId === rootMessage.id)
        .sort((a, b) => a.createdAt - b.createdAt),
    [messages, rootMessage.id],
  );

  // Ao abrir (ou trocar de thread): vai direto para a resposta mais recente.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    wasNearBottom.current = true;
  }, [rootMessage.id]);
  // Mensagens medem depois do primeiro commit (fontes, anexos, avatares): enquanto a pessoa está
  // no fim, o conteúdo que cresce continua ancorado no fim.
  useEffect(() => {
    const el = scrollRef.current;
    const inner = contentRef.current;
    if (!el || !inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (wasNearBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [rootMessage.id]);
  // Resposta nova: acompanha só se a pessoa já estava no fim.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && wasNearBottom.current) el.scrollTop = el.scrollHeight;
  }, [replies.length]);

  const verNoCanal = () => {
    // Quando o painel está sobre o chat (camada/tela cheia) ele cobriria a mensagem: fecha junto.
    const position = rootRef.current
      ? getComputedStyle(rootRef.current.parentElement!).position
      : "";
    const cobre = position === "absolute" || position === "fixed";
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev, highlight: rootMessage.id };
        if (cobre) delete next.thread;
        return next;
      },
    });
  };

  const noop = () => {};
  return (
    <div
      ref={rootRef}
      className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-l border-border bg-background motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-200"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5 md:px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Voltar ao chat"
          className="-ml-1 md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Thread</p>
          <p className="text-[11px] text-muted-foreground">
            {replies.length} resposta{replies.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={verNoCanal} className="text-xs">
          Ver no canal
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Fechar thread"
          className="hidden md:inline-flex"
        >
          <X className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Fechar thread"
          className="md:hidden"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        }}
        className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <div ref={contentRef}>
          <section
            aria-label="Mensagem original"
            className="border-b border-border bg-muted/20 py-2"
          >
            <ChatV2Message
              message={rootMessage}
              showHeader
              meId={meId}
              members={members}
              onReply={noop}
              onDelete={(id) => void deleteMessage(id)}
            />
          </section>
          <p className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {replies.length === 0
              ? "Respostas"
              : `${replies.length} resposta${replies.length === 1 ? "" : "s"}`}
          </p>
          <div className="pb-3">
            {replies.map((m, i) => (
              <ChatV2Message
                key={m.id}
                message={m}
                showHeader={i === 0 || replies[i - 1].authorId !== m.authorId}
                meId={meId}
                members={members}
                onReply={noop}
                onDelete={(id) => void deleteMessage(id)}
              />
            ))}
            {replies.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nenhuma resposta ainda. Seja o primeiro a responder.
              </p>
            )}
          </div>
        </div>
      </div>
      <ChatV2Composer convoId={rootMessage.convoId} replyToId={rootMessage.id} isThread />
    </div>
  );
}
