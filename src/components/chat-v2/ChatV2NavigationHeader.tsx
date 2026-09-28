import { SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ChatV2NavigationHeader({ onNewConversation }: { onNewConversation: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between px-3.5 py-3.5">
      <p className="text-base font-semibold text-foreground">Conversas</p>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Nova conversa"
            onClick={onNewConversation}
          >
            <SquarePen className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Nova conversa</TooltipContent>
      </Tooltip>
    </div>
  );
}
