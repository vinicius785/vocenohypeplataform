import { useEffect } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { useChatV2Data } from "@/components/chat-v2/use-chat-v2-data";
import { ChatV2ConversationPane } from "@/components/chat-v2/ChatV2ConversationPane";
import { setLastConvoRoute } from "@/components/chat-v2/chat-v2-utils";

export const Route = createFileRoute("/_authenticated/chat-v2/channel/$id")({
  component: ChatV2ChannelPage,
  validateSearch: z.object({ thread: z.string().optional(), highlight: z.string().optional() }),
});

function ChatV2ChannelPage() {
  const { id } = useParams({ from: "/_authenticated/chat-v2/channel/$id" });
  const navigate = useNavigate();
  const { me, members, messages, channels, projectChannels } = useChatV2Data();
  // Aceita tanto um id de canal real (uuid) quanto um id sintético de
  // projeto já prefixado ("proj:..."), já que a navegação aponta canais e
  // projetos pra esta mesma rota (ver `ChatV2Navigation.routeFor`).
  const convoId = id.startsWith("proj:") ? id : `c:${id}`;
  const channel = channels.find((c) => c.id === convoId);
  const project = projectChannels.find((p) => p.id === convoId);
  useEffect(() => setLastConvoRoute({ kind: "channel", id }), [id]);

  return (
    <ChatV2ConversationPane
      convoId={convoId}
      headerInfo={
        channel
          ? {
              kind: "channel",
              channel,
              memberCount: channel.allowedMemberIds?.length || members.length,
            }
          : project
            ? { kind: "projeto", name: project.name }
            : null
      }
      messages={messages}
      meId={me.id}
      members={members}
      onBack={() => void navigate({ to: "/chat-v2", search: { stay: true } })}
    />
  );
}
