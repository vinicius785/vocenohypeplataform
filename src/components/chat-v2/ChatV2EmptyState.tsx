import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChatV2EmptyState({ onNewConversation }: { onNewConversation: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MessageSquarePlus className="h-6 w-6" />
      </span>
      <div>
        <p className="text-base font-semibold text-foreground">Comece uma conversa</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Converse com o time ou acompanhe campanhas.
        </p>
      </div>
      <div className="mt-2 flex gap-2">
        <Button onClick={onNewConversation}>Nova conversa</Button>
      </div>
    </div>
  );
}
