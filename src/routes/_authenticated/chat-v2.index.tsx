import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { buildChatList } from "@/lib/chat-store";
import { useChatV2Data } from "@/components/chat-v2/use-chat-v2-data";
import { getLastConvoRoute, routeForConvoId } from "@/components/chat-v2/chat-v2-utils";
import { ChatV2EmptyState } from "@/components/chat-v2/ChatV2EmptyState";
import { ChatV2NewConversationDialog } from "@/components/chat-v2/ChatV2NewConversationDialog";

export const Route = createFileRoute("/_authenticated/chat-v2/")({
  component: ChatV2Empty,
  validateSearch: z.object({ stay: z.boolean().optional() }),
});

/**
 * `/chat-v2` nunca fica parado numa tela vazia se já existe conversa:
 * restaura a última aberta (localStorage, por dispositivo) ou, na
 * primeira visita, abre a conversa com atividade mais recente. Só mostra
 * o estado vazio de verdade quando não há nenhuma conversa disponível.
 *
 * EXCEÇÃO: o botão "voltar" do mobile (`onBack` nas 3 rotas de
 * conversa) navega pra cá com `?stay=1` — sem essa saída, o próprio
 * efeito de restauração abaixo mandava de volta pra última conversa
 * (a mesma que acabou de sair), prendendo quem usa o Chat no celular
 * numa conversa só, sem conseguir ver a lista. `stay` só vale pra ESSA
 * navegação (não é persistido) — abrir `/chat-v2` de novo sem o
 * parâmetro volta a restaurar normalmente.
 */
function ChatV2Empty() {
  const navigate = useNavigate();
  const { stay } = useSearch({ from: "/_authenticated/chat-v2/" });
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
    if (stay) return; // veio do botão "voltar" — fica na lista
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
      void navigate({ ...routeForConvoId(mostRecent.id, me.id), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, mostRecent?.id]);

  if (!stay && (getLastConvoRoute() || mostRecent)) {
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
