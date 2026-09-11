import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}: {
  icon?: ReactNode;
  /** Aditivo (Etapa 4) — tinge o círculo do ícone com um tom semântico
   * (ex.: alerta de alta severidade) em vez do `bg-muted` neutro padrão.
   * Omitir mantém o visual atual de todo consumidor existente. */
  iconTone?: SemanticTone;
  title: string;
  description?: string;
  meta?: string;
  status?: { label: string; tone: SemanticTone };
  value?: string;
  onClick?: () => void;
  primaryAction?: { label: string; onClick: () => void };
  menuItems?: { label: string; onClick: () => void; destructive?: boolean }[];
}) {
  const Comp = onClick ? "button" : "div";

  return (
    <div className="group flex flex-wrap items-center gap-3 px-4 py-3">
      <Comp
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn(
          // min-w-[140px] em vez de min-w-0: garante que o título nunca
          // encolha até truncar pra 1-2 letras quando badge/valor/menu não
          // cabem juntos em telas estreitas — nesse caso o grupo à direita
          // quebra pra uma segunda linha (flex-wrap no container pai) em
          // vez do título desaparecer. Achado ao vivo em 320px.
          "flex min-w-[140px] flex-1 items-center gap-3 text-left",
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
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
            {description && <span className="truncate">{description}</span>}
            {meta && <span className="hidden truncate sm:inline">· {meta}</span>}
          </div>
        </div>
      </Comp>

      <div className="ml-auto flex shrink-0 items-center gap-3">
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
