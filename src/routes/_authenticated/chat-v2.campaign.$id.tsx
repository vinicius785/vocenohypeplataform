import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { useChatV2Data } from "@/components/chat-v2/use-chat-v2-data";
import { ChatV2Conversation } from "@/components/chat-v2/ChatV2Conversation";

export const Route = createFileRoute("/_authenticated/chat-v2/campaign/$id")({
  component: ChatV2CampaignPage,
  validateSearch: z.object({ thread: z.string().optional() }),
});

function ChatV2CampaignPage() {
  const { id } = useParams({ from: "/_authenticated/chat-v2/campaign/$id" });
  const navigate = useNavigate();
  const { me, members, messages, campaignChannels } = useChatV2Data();
  const convoId = `camp:${id}`;
  const campaign = campaignChannels.find((c) => c.id === convoId);

  return (
    <ChatV2Conversation
      convoId={convoId}
      headerInfo={
        campaign ? { kind: "campaign", name: campaign.name, empresa: campaign.empresa } : null
      }
      messages={messages}
      meId={me.id}
      members={members}
      onBack={() => void navigate({ to: "/chat-v2" })}
    />
  );
}
