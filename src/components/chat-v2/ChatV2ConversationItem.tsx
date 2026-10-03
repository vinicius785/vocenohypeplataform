import { Link } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { formatConvoTimestamp } from "./chat-v2-utils";

export function ChatV2ConversationItem({
  to,
  params,
  active,
  icon,
  name,
  unread,
  hasMention,
  preview,
  timestamp,
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
  /** Epoch ms da última mensagem — exibido discretamente à direita do
   * nome ("11:50" hoje, "25/09" em outro dia). Ausente quando a conversa
   * ainda não tem nenhuma mensagem. */
  timestamp?: number;
  subtitle?: string;
}) {
  const unreadState = unread > 0;
  // Correção de contraste do estado ACTIVE: `text-brand-foreground` é um
  // navy quase preto (#0B1020), pensado pra ficar sobre o `bg-brand`
  // SÓLIDO e claro (ver comentário de contraste em `styles.css`) — usado
  // aqui sobre `bg-brand-subtle` (só ~14% de tinta de azul sobre o fundo
  // já escuro do dark theme), virava texto escuro sobre fundo escuro,
  // quase ilegível. O fundo azul/indigo sutil continua exatamente como
  // estava (identidade do estado selecionado); só a cor do TEXTO em cima
  // dele muda pra usar os tokens de texto já claros no dark theme
  // (`foreground`/`foreground/80`), com um degrau de contraste a mais
  // que o estado default pra manter a hierarquia nome > preview > horário
  // pedida, sem inventar nenhuma cor nova.
  return (
    <Link
      to={to}
      params={params}
      className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
        active ? "bg-brand-subtle" : "hover:bg-muted/60"
      }`}
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
        {icon}
        {unreadState && (
          <span
            aria-hidden="true"
            className="absolute -left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`block min-w-0 truncate text-sm text-foreground ${
                  unreadState ? "font-semibold" : "font-medium"
                }`}
              >
                {name}
              </span>
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
          {timestamp && (
            <span
              className={`shrink-0 text-[11px] ${active ? "text-foreground/70" : "text-muted-foreground"}`}
            >
              {formatConvoTimestamp(timestamp)}
            </span>
          )}
        </span>
        <span
          className={`block truncate text-xs ${
            active || unreadState ? "text-foreground/80" : "text-muted-foreground"
          }`}
        >
          {preview || subtitle || "Nenhuma mensagem ainda"}
        </span>
      </span>
      {hasMention && (
        <Badge variant="brand" className="h-5 shrink-0 px-1.5 text-[11px]">
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
