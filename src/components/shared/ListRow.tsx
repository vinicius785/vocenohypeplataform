import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TONE_SOFT_BG, type SemanticTone } from "@/lib/design-tokens";

/**
 * Linha de lista canônica — generaliza o padrão já validado em
 * `financeiro/EntryRow.tsx` (ícone + título + metadados que colapsam +
 * status + valor + ação), sem ficar preso ao domínio financeiro.
 * Responsivo: metadados secundários (`meta`) somem em telas estreitas
 * (`hidden sm:inline`), nunca causam overflow horizontal.
 */
export function ListRow({
  icon,
  iconTone,
  title,
  description,
  meta,
  status,
  value,
  onClick,
  primaryAction,
  menuItems,
  time,
  unread = false,
  multiline = false,
  secondaryAction,
}: {
  icon?: ReactNode;
  /** Aditivo (Etapa 4) — tinge o círculo do ícone com um tom semântico
   * (ex.: alerta de alta severidade) em vez do `bg-muted` neutro padrão.
   * Omitir mantém o visual atual de todo consumidor existente. */
  iconTone?: SemanticTone;
  title: string;
  /** Aceita `ReactNode` (não só `string`) desde a Etapa 5 — ex.: destacar
   * o autor em negrito dentro da prévia de uma mensagem. Consumidores
   * existentes que só passam string continuam idênticos. */
  description?: ReactNode;
  meta?: string;
  status?: { label: string; tone: SemanticTone };
  value?: string;
  onClick?: () => void;
  primaryAction?: { label: string; onClick: () => void };
  menuItems?: { label: string; onClick: () => void; destructive?: boolean }[];
  /** Aditivo (Etapa 5, painel de Notificações) — horário/data no canto
   * superior direito da linha do TÍTULO especificamente (não centralizado
   * com o resto, como `value`/`status`), nunca sobrepondo o título
   * (`truncate` no título + `shrink-0` aqui). Omitir não muda nada pra
   * quem já usa `ListRow`. */
  time?: string;
  /** Aditivo — diferenciação sutil de item não lido: pontinho da marca
   * antes do título, título com peso maior e fundo levemente destacado.
   * Nunca depende só disso pra comunicar o estado (o ponto é visual, o
   * peso da fonte já ajuda quem não distingue cor). */
  unread?: boolean;
  /** Aditivo — descrição em até 2 linhas com reticências, em vez do
   * truncamento de 1 linha padrão (`truncate`). */
  multiline?: boolean;
  /** Aditivo — ação de ícone secundária, visível só no hover/foco da
   * linha (ex.: "marcar como lida" sem navegar) — diferente de
   * `primaryAction`, que é um botão sempre visível. */
  secondaryAction?: { icon: ReactNode; label: string; onClick: () => void };
}) {
  const Comp = onClick ? "button" : "div";

  return (
    <div
      className={cn(
        "group flex flex-wrap items-center gap-3 px-4 py-3",
        unread && "bg-brand-subtle/40",
      )}
    >
      <Comp
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn(
          // min-w-[140px] em vez de min-w-0: garante que o título nunca
          // encolha até truncar pra 1-2 letras quando badge/valor/menu não
          // cabem juntos em telas estreitas — nesse caso o grupo à direita
          // quebra pra uma segunda linha (flex-wrap no container pai) em
          // vez do título desaparecer. Achado ao vivo em 320px.
          "flex min-w-[140px] flex-1 gap-3 text-left",
          time || multiline ? "items-start" : "items-center",
          onClick && "cursor-pointer",
        )}
      >
        {icon && (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              TONE_SOFT_BG[iconTone ?? "neutral"],
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {unread && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            )}
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-sm text-foreground",
                unread ? "font-semibold" : "font-medium",
              )}
            >
              {title}
            </p>
            {time && (
              <span className="shrink-0 whitespace-nowrap text-[11px] text-text-secondary">
                {time}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
            {description && (
              <span className={multiline ? "line-clamp-2" : "truncate"}>{description}</span>
            )}
            {meta && <span className="hidden truncate sm:inline">· {meta}</span>}
          </div>
        </div>
      </Comp>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {status && (
          <Badge
            variant={status.tone === "neutral" ? "secondary" : status.tone}
            className="shrink-0"
          >
            {status.label}
          </Badge>
        )}
        {value && (
          <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-foreground">
            {value}
          </span>
        )}
        {primaryAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={primaryAction.onClick}
            className="hidden shrink-0 sm:inline-flex"
          >
            {primaryAction.label}
          </Button>
        )}
        {secondaryAction && (
          <IconButton
            label={secondaryAction.label}
            onClick={(e) => {
              e.stopPropagation();
              secondaryAction.onClick();
            }}
            className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          >
            {secondaryAction.icon}
          </IconButton>
        )}
        {menuItems && menuItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Mais ações" className="shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menuItems.map((item) => (
                <DropdownMenuItem
                  key={item.label}
                  onClick={item.onClick}
                  className={
                    item.destructive ? "text-destructive focus:text-destructive" : undefined
                  }
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
