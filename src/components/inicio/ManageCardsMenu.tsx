/**
 * "Gerenciar cards" da Home — redesenho puramente visual/estrutural:
 * TODA a lógica de visibilidade, persistência (`localStorage`) e
 * integração com o dashboard continua em `InicioDashboard.tsx`, que só
 * passa estado + callbacks pra cá. Este componente decide unicamente
 * COMO apresentar essa lista (Popover no desktop, Sheet de baixo no
 * mobile), nunca O QUE ela guarda.
 *
 * Corte pelo cabeçalho (o bug relatado): o dropdown antigo era um `<div>`
 * absoluto dentro da própria árvore do `<header overflow-hidden>` — ao
 * abrir perto do topo/borda, o clip do cabeçalho cortava o menu. O
 * `Popover` do design system já usa `PopoverPrimitive.Portal` (Radix),
 * que anexa o conteúdo direto em `document.body`, fora da árvore
 * clipada — some o corte sem precisar de nenhum hack de z-index. Radix
 * também já resolve "abrir abaixo/à direita, inverter se não couber,
 * manter distância da borda" via `avoidCollisions` (default) +
 * `collisionPadding`, então não foi preciso reimplementar posicionamento.
 */
import { useRef, useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  Calendar,
  Wallet,
  TrendingUp,
  MessageSquare,
  Star,
  CloudSun,
  RotateCcw,
  X,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SURFACE } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import type { CardKey } from "@/components/InicioDashboard";

export type ManageCardDef = { key: CardKey; label: string; description: string };

const CARD_ICON: Record<CardKey, React.ReactNode> = {
  stats: <Sparkles className="h-4 w-4" />,
  work: <CheckCircle2 className="h-4 w-4" />,
  agenda: <Calendar className="h-4 w-4" />,
  financeiro: <Wallet className="h-4 w-4" />,
  comercial: <TrendingUp className="h-4 w-4" />,
  comments: <MessageSquare className="h-4 w-4" />,
  personal: <Star className="h-4 w-4" />,
};

/** Uma linha "ícone + nome + descrição + Switch" — mesmo layout pro card
 * de verdade e pro toggle de clima (que não é bem um "card" da lista,
 * mas precisa continuar existindo em algum lugar do menu). */
function ToggleRow({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
  id,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: () => void;
  id: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="shrink-0 data-[state=checked]:bg-brand"
      />
    </label>
  );
}

export function ManageCardsMenu({
  cardDefs,
  visible,
  onToggleCard,
  onRestoreDefaults,
  weatherEnabled,
  onToggleWeather,
}: {
  cardDefs: ManageCardDef[];
  visible: Record<CardKey, boolean>;
  onToggleCard: (key: CardKey) => void;
  onRestoreDefaults: () => void;
  weatherEnabled: boolean;
  onToggleWeather: () => void;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Restaura o foco no botão que abriu o menu ao fechar (clicar fora, Esc,
  // botão de fechar ou escolher uma opção no mobile) — nunca deixa o foco
  // "perdido" na página depois do menu sumir.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) triggerRef.current?.focus();
  };

  const list = (
    <div className="divide-y divide-border/60">
      {cardDefs.map((c) => (
        <ToggleRow
          key={c.key}
          id={`inicio-card-${c.key}`}
          icon={CARD_ICON[c.key]}
          label={c.label}
          description={c.description}
          checked={visible[c.key]}
          onCheckedChange={() => onToggleCard(c.key)}
        />
      ))}
      <ToggleRow
        id="inicio-card-weather"
        icon={<CloudSun className="h-4 w-4" />}
        label="Ambiente climático"
        description="Efeito visual no cabeçalho, conforme o clima"
        checked={weatherEnabled}
        onCheckedChange={onToggleWeather}
      />
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between border-t border-border/60 px-3 py-2.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRestoreDefaults}
        className="gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restaurar padrão
      </Button>
    </div>
  );

  const trigger = (
    <Button
      ref={triggerRef}
      type="button"
      variant="outline"
      size="sm"
      onClick={() => handleOpenChange(true)}
      className="gap-1.5"
    >
      <Sparkles className="h-3.5 w-3.5" />
      Gerenciar cards
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent
            side="bottom"
            className={cn(
              "flex max-h-[85vh] flex-col gap-0 rounded-t-2xl border-t p-0 pb-[env(safe-area-inset-bottom)]",
              SURFACE.raised,
            )}
          >
            <SheetHeader className="space-y-1 px-4 pb-3 pt-5 text-left">
              <SheetTitle className="text-base">Personalizar tela inicial</SheetTitle>
              <SheetDescription>Escolha quais cards aparecem no seu início</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/60">{list}</div>
            {footer}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          "z-50 flex w-[340px] max-w-[360px] min-w-[320px] flex-col gap-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-lg",
          SURFACE.raised,
        )}
        style={{ maxHeight: "min(30rem, calc(100vh - 24px))" }}
      >
        <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Personalizar tela inicial</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Escolha quais cards aparecem no seu início
            </p>
          </div>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  aria-label="Fechar"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Fechar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/60">{list}</div>
        {footer}
      </PopoverContent>
    </Popover>
  );
}
