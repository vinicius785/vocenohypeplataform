import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { useChatV2Data } from "@/components/chat-v2/use-chat-v2-data";
import { ChatV2Conversation } from "@/components/chat-v2/ChatV2Conversation";

export const Route = createFileRoute("/_authenticated/chat-v2/channel/$id")({
  component: ChatV2ChannelPage,
  validateSearch: z.object({ thread: z.string().optional() }),
});

function ChatV2ChannelPage() {
  const { id } = useParams({ from: "/_authenticated/chat-v2/channel/$id" });
  const navigate = useNavigate();
  const { me, members, messages, channels, projectChannels } = useChatV2Data();
  // Aceita tanto um id de canal real (uuid) quanto um id sintético de
  // projeto já prefixado ("proj:..."), já que a sidebar aponta canais e
  // projetos pra esta mesma rota (ver `ChatV2Sidebar.routeFor`).
  const convoId = id.startsWith("proj:") ? id : `c:${id}`;
  const channel = channels.find((c) => c.id === convoId);
  const project = projectChannels.find((p) => p.id === convoId);

  return (
    <ChatV2Conversation
      convoId={convoId}
      headerInfo={
        channel
          ? {
              kind: "channel",
              channel,
              memberCount: channel.allowedMemberIds?.length || members.length,
            }
          : project
            ? {
                kind: "channel",
                channel: { id: convoId, name: project.name, createdAt: 0 },
                memberCount: members.length,
              }
            : null
      }
      messages={messages}
      meId={me.id}
      members={members}
      onBack={() => void navigate({ to: "/chat-v2" })}
    />
  );
}
