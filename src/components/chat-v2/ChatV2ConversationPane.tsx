import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { loadLastRead, markRead, type ChatMember, type ChatMessage } from "@/lib/chat-store";
import { ChatV2Header } from "./ChatV2Header";
import { ChatV2Timeline } from "./ChatV2Timeline";
import { ChatV2Composer } from "./ChatV2Composer";
import { ChatV2ThreadPanel } from "./ChatV2ThreadPanel";

type HeaderInfo = React.ComponentProps<typeof ChatV2Header>["info"];

/** Conteúdo comum de qualquer conversa (DM/canal/campanha): cabeçalho,
 * timeline, composer e painel de thread — as 3 rotas de conversa só
 * calculam `convoId`/`headerInfo`/`onBack` e delegam o resto pra cá.
 *
 * "Marcar como lida" só dispara depois que a conversa fica de fato visível
 * por um instante (não no instante do clique) — um `setTimeout` cancelável
 * é a aproximação mais simples de "visualização real" sem instrumentar
 * IntersectionObserver por mensagem; reavaliado a cada nova mensagem
 * enquanto a conversa permanece aberta.
 */
export function ChatV2ConversationPane({
  convoId,
  headerInfo,
  messages,
  meId,
  members,
  onBack,
}: {
  convoId: string;
  headerInfo: HeaderInfo;
  messages: ChatMessage[];
  meId: string;
  members: ChatMember[];
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { thread?: string; highlight?: string };
  const threadId = search.thread;
  const highlightId = search.highlight;
  const convoMessages = messages.filter((m) => m.convoId === convoId);
  const rootMessage = threadId ? convoMessages.find((m) => m.id === threadId) : undefined;
  const [lastReadAt, setLastReadAt] = useState(() => loadLastRead()[convoId] ?? 0);

  useEffect(() => {
    setLastReadAt(loadLastRead()[convoId] ?? 0);
    const t = setTimeout(() => void markRead(convoId), 1200);
    return () => clearTimeout(t);
  }, [convoId, convoMessages.length]);

  const openThread = (m: ChatMessage) => {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, thread: m.id }),
    });
  };
  // Placeholder contextual do composer ("Mensagem para X") — derivado do
  // mesmo `headerInfo` que o cabeçalho já usa, nunca um texto genérico
  // quando o nome da conversa está disponível.
  const conversationLabel =
    headerInfo?.kind === "dm"
      ? headerInfo.member.name
      : headerInfo?.kind === "channel"
        ? `#${headerInfo.channel.name}`
        : headerInfo?.kind === "projeto" || headerInfo?.kind === "campaign"
          ? headerInfo.name
          : undefined;

  const closeThread = () => {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        delete next.thread;
        return next;
      },
    });
  };

  return (
    <div className="flex h-full min-w-0 flex-1">
      {/* .conversation-pane: grid de 3 linhas (header/timeline/composer) em
       * vez do antigo `flex flex-col` — a diferença importa porque um filho
       * flex sem `min-height:0` explícito cresce pra caber seu conteúdo
       * (a timeline com muitas mensagens), empurra o composer pra fora da
       * área visível e é isso que fazia mensagens ficarem escondidas atrás
       * do cabeçalho/composer. Com `grid-template-rows: auto minmax(0,1fr)
       * auto`, a linha do meio (timeline) é forçada a caber na altura
       * disponível e é ELA que rola — não a página. */}
      <div className="grid h-full min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <ChatV2Header
          info={headerInfo}
          onBack={onBack}
          convoId={convoId}
          meId={meId}
          members={members}
        />
        <ChatV2Timeline
          convoId={convoId}
          messages={convoMessages}
          meId={meId}
          members={members}
          lastReadAt={lastReadAt}
          onReply={openThread}
          highlightId={highlightId}
          channelName={headerInfo?.kind === "channel" ? headerInfo.channel.name : undefined}
        />
        <ChatV2Composer convoId={convoId} conversationLabel={conversationLabel} />
      </div>
      {rootMessage && (
        <div className="fixed inset-0 z-20 md:static md:inset-auto md:z-auto">
          <ChatV2ThreadPanel
            rootMessage={rootMessage}
            messages={convoMessages}
            meId={meId}
            members={members}
            onClose={closeThread}
          />
        </div>
      )}
    </div>
  );
}
