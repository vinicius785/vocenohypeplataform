import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageContainerVariant = "standard" | "wide" | "full";

const VARIANT_CLASS: Record<PageContainerVariant, string> = {
  standard: "mx-auto w-full max-w-[1280px]",
  wide: "mx-auto w-full max-w-[1600px]",
  full: "w-full",
};

/**
 * Largura de página centralizada (Etapa 3) — antes cada `*Section.tsx`
 * hardcodava seu próprio `max-w-5xl/6xl/7xl/[1000px]/[1600px]` sem
 * critério único. `standard` (1280px) é o padrão pra a maioria das telas;
 * `wide` (1600px) é só pra Kanban/tabelas largas (Comercial); `full` é
 * pra experiências full-bleed (Chat).
 *
 * Sem padding horizontal aqui de propósito (rodada corretiva) — todo
 * consumidor atual já renderiza dentro do `<main className="p-4
 * md:p-8">` do `AppShell`; somar `px-*` aqui empilhava dois paddings e
 * era exatamente a "largura estreita com vazio artificial" reportada —
 * em telas grandes com a sidebar expandida, o dobro de padding sozinho
 * já impedia o conteúdo de chegar perto de 1280px.
 */
export function PageContainer({
  variant = "standard",
  className,
  children,
}: {
  variant?: PageContainerVariant;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn(VARIANT_CLASS[variant], className)}>{children}</div>;
}
