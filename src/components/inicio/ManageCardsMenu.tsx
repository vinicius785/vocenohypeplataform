/**
 * "Personalizar início" (antes "Gerenciar cards") — TODA a lógica de
 * visibilidade/ordem/persistência continua em `InicioDashboard.tsx`, que
 * só passa estado + callbacks pra cá; este componente decide só COMO
 * apresentar (Popover no desktop, Sheet de baixo no mobile).
 *
 * Reaproveitado quase integralmente do antigo "Gerenciar cards" — mesmo
 * Popover/Sheet, mesmo `ToggleRow`, mesmo retorno de foco ao trigger.
 * Adicionado nesta rodada: botão do design system (variant="outline"
 * compacto, ícone+texto no desktop / só ícone+tooltip+aria-label no
 * mobile — antes era sempre ícone+texto), reordenação por
 * arrastar-e-soltar (mesmo padrão HTML5 nativo já usado em
 * `TaskBoard.tsx`/`PipelineBoard.tsx` — não há dnd-kit no projeto) e
 * "Concluir" ao lado de "Restaurar padrão".
 */
import { useRef, useState } from "react";
import {
  SlidersHorizontal,
  CheckCircle2,
  Calendar,
  Wallet,
  TrendingUp,
  MessageSquare,
  Bell,
  Coffee,
  CloudSun,
  RotateCcw,
  GripVertical,
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
  stats: <SlidersHorizontal className="h-4 w-4" />,
  work: <CheckCircle2 className="h-4 w-4" />,
  agenda: <Calendar className="h-4 w-4" />,
  financeiro: <Wallet className="h-4 w-4" />,
  comercial: <TrendingUp className="h-4 w-4" />,
  comments: <MessageSquare className="h-4 w-4" />,
  reminders: <Bell className="h-4 w-4" />,
  quickBreak: <Coffee className="h-4 w-4" />,
};

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
  id,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  dragging,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: () => void;
  id: string;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  dragging?: boolean;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "flex items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/50",
        dragging && "opacity-50",
      )}
    >
      {draggable && (
        <GripVertical
          className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing"
          aria-hidden="true"
        />
      )}
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="block truncate text-xs text-muted-foreground">{description}</span>
        </span>
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="shrink-0 data-[state=checked]:bg-brand"
      />
    </div>
  );
}

export function ManageCardsMenu({
  cardDefs,
  visible,
  onToggleCard,
  onReorder,
  onRestoreDefaults,
  weatherEnabled,
  onToggleWeather,
}: {
  cardDefs: ManageCardDef[];
  visible: Record<CardKey, boolean>;
  onToggleCard: (key: CardKey) => void;
  /** Reordena a lista de cards opcionais — reflete a ordem escolhida na
   * lista deste menu; ver nota em `InicioDashboard.tsx` sobre o alcance
   * real da reordenação (dentro de cada agrupamento estrutural fixo,
   * nunca refazendo o grid inteiro). */
  onReorder: (fromKey: CardKey, toKey: CardKey) => void;
  onRestoreDefaults: () => void;
  weatherEnabled: boolean;
  onToggleWeather: () => void;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [dragKey, setDragKey] = useState<CardKey | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
          draggable
          dragging={dragKey === c.key}
          onDragStart={() => setDragKey(c.key)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragKey && dragKey !== c.key) onReorder(dragKey, c.key);
            setDragKey(null);
          }}
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
      <Button type="button" variant="secondary" size="sm" onClick={() => handleOpenChange(false)}>
        Concluir
      </Button>
    </div>
  );

  const triggerButton = (
    <Button
      ref={triggerRef}
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => handleOpenChange(true)}
      aria-label="Personalizar início"
      className="gap-1.5 rounded-full border border-border/60 bg-muted/50 text-muted-foreground hover:text-foreground"
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      {!isMobile && "Personalizar início"}
    </Button>
  );

  // No mobile, só o ícone — precisa de tooltip pra quem usa mouse/teclado
  // acoplado, `aria-label` (já no botão) cobre leitor de tela.
  const trigger = isMobile ? (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
        <TooltipContent side="bottom">Personalizar início</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    triggerButton
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
              <SheetTitle className="text-base">Personalizar início</SheetTitle>
              <SheetDescription>Escolha o que deseja visualizar no seu painel.</SheetDescription>
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
          "z-50 flex w-[380px] max-w-[400px] min-w-[340px] flex-col gap-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-lg",
          SURFACE.raised,
        )}
        style={{ maxHeight: "min(32rem, calc(100vh - 24px))" }}
      >
        <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Personalizar início</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Escolha o que deseja visualizar no seu painel.
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
