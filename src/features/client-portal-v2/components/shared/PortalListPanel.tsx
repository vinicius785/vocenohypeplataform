import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** Painel de lista — mesmo fundo/raio/sombra que qualquer superfície do
 * Portal V2 (`rounded-2xl bg-card dark:shadow-none`, igual à faixa de
 * `SummaryStat` e aos cards de `ClientCampaignCard`). Linhas separadas
 * por divisor sutil, nunca cada uma com sua própria borda. */
export function PortalListPanel({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/70 rounded-2xl bg-card dark:shadow-none">{children}</div>
  );
}

/**
 * Linha de lista clicável — a linha inteira é o alvo de clique (nunca um
 * botão azul grande competindo com ela); a affordance de "abre algo" é
 * só um chevron discreto à direita, nunca uma cor de destaque. `div` com
 * `role="button"` (não um `<button>` de verdade) porque o slot
 * `trailing` pode conter outro elemento interativo (menu de ações) —
 * botão dentro de botão é HTML inválido e quebra o menu. `Enter`/`Espaço`
 * na linha focada disparam `onClick`, igual a um botão real.
 */
export function PortalListRow({
  icon,
  title,
  meta,
  onClick,
  trailing,
}: {
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  onClick: () => void;
  /** Slot opcional à direita, antes do chevron (ex.: menu de ações). */
  trailing?: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground group-hover:underline">
          {title}
        </p>
        {meta && <div className="mt-0.5 truncate text-xs text-text-secondary">{meta}</div>}
      </div>
      {trailing && (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {trailing}
        </div>
      )}
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </div>
  );
}
