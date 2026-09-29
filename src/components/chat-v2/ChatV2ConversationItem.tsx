import { Link } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export function ChatV2ConversationItem({
  to,
  params,
  active,
  icon,
  name,
  unread,
  hasMention,
  preview,
  /** Contexto secundário exibido no lugar da prévia quando ainda não há
   * mensagem (ex: "Campanha · Cix Citizen") — nunca junto da prévia real. */
  subtitle,
}: {
  to: string;
  params: Record<string, string>;
  active: boolean;
  icon: React.ReactNode;
  name: string;
  unread: number;
  hasMention?: boolean;
  preview?: string;
  subtitle?: string;
}) {
  const unreadState = unread > 0;
  return (
    <Link
      to={to}
      params={params}
      className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
        active ? "bg-brand-subtle" : "hover:bg-muted/60"
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`block truncate text-sm ${
                active
                  ? "font-semibold text-brand-foreground"
                  : unreadState
                    ? "font-semibold text-foreground"
                    : "font-medium text-foreground"
              }`}
            >
              {name}
            </span>
          </TooltipTrigger>
          <TooltipContent>{name}</TooltipContent>
        </Tooltip>
        <span
          className={`block truncate text-xs ${unreadState ? "text-foreground/80" : "text-muted-foreground"}`}
        >
          {preview || subtitle || "Nenhuma mensagem ainda"}
        </span>
      </span>
      {hasMention && (
        <Badge variant="brand" className="h-5 shrink-0 px-1.5 text-[10px]">
          @
        </Badge>
      )}
      {unreadState && (
        <Badge className="h-5 min-w-5 shrink-0 justify-center bg-brand px-1 text-[11px] text-brand-foreground">
          {unread}
        </Badge>
      )}
    </Link>
  );
}
