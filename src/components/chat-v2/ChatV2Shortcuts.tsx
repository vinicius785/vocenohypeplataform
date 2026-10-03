import { Link } from "@tanstack/react-router";
import { AtSign, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Atalhos compactos (não são cards grandes) — só aparecem com contador
 * quando há algo pra mostrar; sem contagem, o botão ainda existe (visita
 * rápida), só sem o badge. */
export function ChatV2Shortcuts({
  unreadCount,
  mentionCount,
}: {
  unreadCount: number;
  mentionCount: number;
}) {
  return (
    <div className="flex gap-1.5 px-3 pb-2">
      <Link
        to="/chat-v2"
        className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <Inbox className="h-3.5 w-3.5" />
        Não lidas
        {unreadCount > 0 && (
          <Badge className="ml-auto h-4 min-w-4 justify-center bg-brand px-1 text-[11px] text-brand-foreground">
            {unreadCount}
          </Badge>
        )}
      </Link>
      <Link
        to="/chat-v2"
        className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <AtSign className="h-3.5 w-3.5" />
        Menções
        {mentionCount > 0 && (
          <Badge className="ml-auto h-4 min-w-4 justify-center bg-brand px-1 text-[11px] text-brand-foreground">
            {mentionCount}
          </Badge>
        )}
      </Link>
    </div>
  );
}
