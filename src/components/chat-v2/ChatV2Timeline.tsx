import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import {
  deleteMessage,
  ensurePinnedLoaded,
  hasMoreOlderMessages,
  loadOlderMessages,
  type ChatMember,
  type ChatMessage,
} from "@/lib/chat-store";
import { Button } from "@/components/ui/button";
import { dateDividerLabel, firstUnreadIndex, groupMessages, isSameDay } from "./chat-v2-utils";
import { ChatV2Message } from "./ChatV2Message";

export function ChatV2Timeline({
  convoId,
  messages,
  meId,
  members,
  lastReadAt,
  onReply,
  highlightId,
  channelName,
}: {
  convoId: string;
  messages: ChatMessage[];
  meId: string;
  members: ChatMember[];
  lastReadAt: number;
  onReply: (message: ChatMessage) => void;
  /** Id de mensagem a destacar (vindo da busca) — recebe um scroll-into-view
   * e um realce temporário de ~2s, depois volta ao normal. */
  highlightId?: string;
  /** Nome do canal (sem `#`), só quando `convoId` é um canal — usado pra
   * mostrar a introdução "# nome / Este é o início do canal #nome." no
   * lugar do texto genérico quando o canal está vazio. */
  channelName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newBelowCount, setNewBelowCount] = useState(0);
  const [activeHighlight, setActiveHighlight] = useState<string | undefined>(undefined);
  const prevCountRef = useRef(messages.length);
  const replyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of messages) {
      if (m.replyToId) counts.set(m.replyToId, (counts.get(m.replyToId) ?? 0) + 1);
    }
    return counts;
  }, [messages]);
  // Respostas em thread não aparecem como mensagens completas no canal
  // principal — só a mensagem raiz, com o indicador compacto de contagem.
  const rootMessages = useMemo(() => messages.filter((m) => !m.replyToId), [messages]);
  const initialUnreadIndex = useMemo(
    () => firstUnreadIndex(rootMessages, lastReadAt, meId),
    // Fixado na abertura da conversa — não deve se mover conforme o usuário
    // lê (senão o divisor "Novas mensagens" ficaria pulando).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convoId],
  );
  const groups = useMemo(() => groupMessages(rootMessages), [rootMessages]);

  // Ao trocar de conversa: ir para a primeira não lida, ou pro final.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      if (initialUnreadIndex !== null) {
        const target = el.querySelector(`[data-unread-divider="1"]`);
        target?.scrollIntoView({ block: "center" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    });
    prevCountRef.current = messages.length;
    setNewBelowCount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convoId]);

  // Nova mensagem chegando: se já estava perto do final, acompanha
  // automaticamente; senão, só conta (botão "N novas mensagens").
  useEffect(() => {
    const el = scrollRef.current;
    const added = messages.length - prevCountRef.current;
    prevCountRef.current = messages.length;
    if (!el || added <= 0) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (nearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    } else {
      setNewBelowCount((n) => n + added);
    }
  }, [messages.length]);

  useEffect(() => {
    if (!highlightId) return;
    setActiveHighlight(highlightId);
    const el = scrollRef.current;
    requestAnimationFrame(() => {
      const target = el?.querySelector(`[data-message-id="${highlightId}"]`);
      target?.scrollIntoView({ block: "center" });
    });
    const t = setTimeout(() => setActiveHighlight(undefined), 2000);
    return () => clearTimeout(t);
  }, [highlightId, convoId]);

  useEffect(() => {
    void ensurePinnedLoaded(convoId);
  }, [convoId]);

  const handleScroll = async () => {
    const el = scrollRef.current;
    if (!el || loadingOlder) return;
    if (el.scrollTop < 80 && hasMoreOlderMessages(convoId)) {
      setLoadingOlder(true);
      const prevHeight = el.scrollHeight;
      await loadOlderMessages(convoId);
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
        }
      });
      setLoadingOlder(false);
    }
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setNewBelowCount(0);
  };

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={() => void handleScroll()}
        className="h-full overflow-y-auto py-3"
        aria-live="off"
      >
        {loadingOlder && (
          <p className="py-2 text-center text-xs text-muted-foreground">Carregando mensagens…</p>
        )}
        {groups.map((group, gi) => {
          const prevGroup = groups[gi - 1];
          const showDateDivider =
            !prevGroup ||
            !isSameDay(
              prevGroup.messages[prevGroup.messages.length - 1].createdAt,
              group.messages[0].createdAt,
            );
          return (
            <div key={group.messages[0].id}>
              {showDateDivider && (
                <div className="my-3 flex items-center gap-3 px-5 md:px-6">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {dateDividerLabel(group.messages[0].createdAt)}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              {group.messages.map((m, mi) => {
                const globalIndex = rootMessages.indexOf(m);
                const isUnreadDivider = globalIndex === initialUnreadIndex;
                return (
                  <div
                    key={m.id}
                    data-message-id={m.id}
                    className={
                      activeHighlight === m.id
                        ? "rounded-md bg-brand/10 outline outline-2 outline-brand/40 transition-colors duration-1000"
                        : undefined
                    }
                  >
                    {isUnreadDivider && (
                      <div
                        data-unread-divider="1"
                        className="my-2 flex items-center gap-3 px-5 md:px-6"
                      >
                        <div className="h-px flex-1 bg-brand/40" />
                        <span className="text-[11px] font-semibold text-brand">
                          Novas mensagens
                        </span>
                        <div className="h-px flex-1 bg-brand/40" />
                      </div>
                    )}
                    <ChatV2Message
                      message={m}
                      showHeader={mi === 0}
                      meId={meId}
                      members={members}
                      onReply={onReply}
                      onDelete={(id) => void deleteMessage(id)}
                      replyCount={replyCounts.get(m.id)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
        {messages.length === 0 &&
          (channelName ? (
            <div className="px-5 py-8 md:px-6">
              <p className="text-lg font-semibold text-foreground"># {channelName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Este é o início do canal #{channelName}.
              </p>
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground md:px-6">
              Nenhuma mensagem ainda. Envie a primeira.
            </p>
          ))}
      </div>
      {newBelowCount > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            size="sm"
            className="pointer-events-auto gap-1.5 shadow-md"
            onClick={jumpToLatest}
          >
            <ChevronUp className="h-3.5 w-3.5 rotate-180" />
            {newBelowCount} nova{newBelowCount > 1 ? "s" : ""} mensage
            {newBelowCount > 1 ? "ns" : "m"}
          </Button>
        </div>
      )}
    </div>
  );
}
