import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { buildChatList, type ChatListItem } from "@/lib/chat-store";
import { useChatV2Data } from "@/components/chat-v2/use-chat-v2-data";
import { getLastConvoRoute } from "@/components/chat-v2/chat-v2-utils";
import { ChatV2EmptyState } from "@/components/chat-v2/ChatV2EmptyState";
import { ChatV2NewConversationDialog } from "@/components/chat-v2/ChatV2NewConversationDialog";

export const Route = createFileRoute("/_authenticated/chat-v2/")({
  component: ChatV2Empty,
});

function routeForItem(
  item: ChatListItem,
  meId: string,
): { to: string; params: Record<string, string> } {
  if (item.kind === "dm") {
    const otherId =
      item.id
        .slice(3)
        .split("|")
        .find((id) => id !== meId) ?? item.id;
    return { to: "/chat-v2/dm/$id", params: { id: otherId } };
  }
  if (item.kind === "campanha")
    return { to: "/chat-v2/campaign/$id", params: { id: item.id.slice(5) } };
  if (item.kind === "projeto") return { to: "/chat-v2/channel/$id", params: { id: item.id } };
  return { to: "/chat-v2/channel/$id", params: { id: item.id.slice(2) } };
}

/**
 * `/chat-v2` nunca fica parado numa tela vazia se já existe conversa:
 * restaura a última aberta (localStorage, por dispositivo) ou, na
 * primeira visita, abre a conversa com atividade mais recente. Só mostra
 * o estado vazio de verdade quando não há nenhuma conversa disponível.
 */
function ChatV2Empty() {
  const navigate = useNavigate();
  const { me, members, channels, messages, campaignChannels, projectChannels } = useChatV2Data();
  const [newConvoOpen, setNewConvoOpen] = useState(false);

  const list = useMemo(
    () =>
      buildChatList({
        channels,
        campaignChannels,
        projectChannels,
        members,
        messages,
        meId: me.id,
      }),
    [channels, campaignChannels, projectChannels, members, messages, me.id],
  );
  const withActivity = list.filter((i) => i.lastMessage);
  const mostRecent = withActivity.sort(
    (a, b) => (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0),
  )[0];

  useEffect(() => {
    if (me.id === "me") return; // ainda carregando a sessão
    const last = getLastConvoRoute();
    if (last) {
      const to =
        last.kind === "dm"
          ? { to: "/chat-v2/dm/$id" as const, params: { id: last.id } }
          : last.kind === "channel"
            ? { to: "/chat-v2/channel/$id" as const, params: { id: last.id } }
            : { to: "/chat-v2/campaign/$id" as const, params: { id: last.id } };
      void navigate({ ...to, replace: true });
      return;
    }
    if (mostRecent) {
      void navigate({ ...routeForItem(mostRecent, me.id), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, mostRecent?.id]);

  if (getLastConvoRoute() || mostRecent) {
    // Redirecionando — evita piscar o estado vazio antes do `navigate` acima.
    return null;
  }

  return (
    <>
      <ChatV2EmptyState onNewConversation={() => setNewConvoOpen(true)} />
      <ChatV2NewConversationDialog
        open={newConvoOpen}
        onOpenChange={setNewConvoOpen}
        members={members}
        channels={channels}
        meId={me.id}
      />
    </>
  );
}
