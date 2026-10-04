import type { ReactNode, Ref } from "react";
import { Card as UiCard, CardHeader } from "@/components/ui/card";

/**
 * Card de seção (Início, portal, lembretes…) — o `Card` CANÔNICO de `ui/card`
 * (`rounded-2xl`, borda `/60`, sem sombra) com `overflow-hidden`, para que
 * listas internas respeitem os cantos. Vive aqui, e não em `InicioDashboard`,
 * para os cartões da Início e do portal não importarem o dashboard inteiro
 * (isso criava um ciclo `InicioDashboard` ↔ cartões).
 */
export function Card({
  children,
  className = "",
  ref,
}: {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <UiCard ref={ref} className={`overflow-hidden ${className}`}>
      {children}
    </UiCard>
  );
}

export { CardHeader };
