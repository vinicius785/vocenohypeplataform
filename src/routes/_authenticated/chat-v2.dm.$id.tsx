import { useEffect } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { dmId, getStatus } from "@/lib/chat-store";
import { HYPITO_AUTHOR_ID, HYPITO_AVATAR_URL, HYPITO_NAME } from "@/lib/hypito";
import { useChatV2Data } from "@/components/chat-v2/use-chat-v2-data";
import { ChatV2ConversationPane } from "@/components/chat-v2/ChatV2ConversationPane";
import { setLastConvoRoute } from "@/components/chat-v2/chat-v2-utils";

export const Route = createFileRoute("/_authenticated/chat-v2/dm/$id")({
  component: ChatV2DmPage,
  validateSearch: z.object({ thread: z.string().optional() }),
});

function ChatV2DmPage() {
  const { id: otherId } = useParams({ from: "/_authenticated/chat-v2/dm/$id" });
  const navigate = useNavigate();
  const { me, members, messages } = useChatV2Data();
  const isHypito = otherId === HYPITO_AUTHOR_ID;
  const other = isHypito
    ? { id: HYPITO_AUTHOR_ID, name: HYPITO_NAME, photo: HYPITO_AVATAR_URL }
    : (members.find((m) => m.id === otherId) ?? { id: otherId, name: "Usuário" });
  const convoId = dmId(me.id, otherId);
  useEffect(() => setLastConvoRoute({ kind: "dm", id: otherId }), [otherId]);

  return (
    <ChatV2ConversationPane
      convoId={convoId}
      headerInfo={{ kind: "dm", member: other, status: getStatus(otherId), isHypito }}
      messages={messages}
      meId={me.id}
      members={members}
      onBack={() => void navigate({ to: "/chat-v2" })}
    />
  );
}
