import { useEffect } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { useChatV2Data } from "@/components/chat-v2/use-chat-v2-data";
import { ChatV2ConversationPane } from "@/components/chat-v2/ChatV2ConversationPane";
import { setLastConvoRoute } from "@/components/chat-v2/chat-v2-utils";

export const Route = createFileRoute("/_authenticated/chat-v2/campaign/$id")({
  component: ChatV2CampaignPage,
  validateSearch: z.object({ thread: z.string().optional(), highlight: z.string().optional() }),
});

function ChatV2CampaignPage() {
  const { id } = useParams({ from: "/_authenticated/chat-v2/campaign/$id" });
  const navigate = useNavigate();
  const { me, members, messages, campaignChannels } = useChatV2Data();
  const convoId = `camp:${id}`;
  const campaign = campaignChannels.find((c) => c.id === convoId);
  useEffect(() => setLastConvoRoute({ kind: "campaign", id }), [id]);

  return (
    <ChatV2ConversationPane
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
