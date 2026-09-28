import { MessageSquarePlus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { HYPITO_AUTHOR_ID } from "@/lib/hypito";

export function ChatV2EmptyState({ onNewConversation }: { onNewConversation: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MessageSquarePlus className="h-6 w-6" />
      </span>
      <div>
        <p className="text-base font-semibold text-foreground">Comece uma conversa</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Converse com o time, acompanhe campanhas ou fale com o Hypito.
        </p>
      </div>
      <div className="mt-2 flex gap-2">
        <Button onClick={onNewConversation}>Nova conversa</Button>
        <Button
          variant="outline"
          onClick={() => void navigate({ to: "/chat-v2/dm/$id", params: { id: HYPITO_AUTHOR_ID } })}
        >
          Abrir o Hypito
        </Button>
      </div>
    </div>
  );
}
