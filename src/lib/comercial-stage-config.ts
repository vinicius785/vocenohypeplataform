import type { OpportunityStage } from "./comercial-engine";

/**
 * Identidade visual dos status do Pipeline Comercial — ÚNICA fonte de verdade.
 *
 * Kanban (ponto/título da coluna, destino do arrastar), cards, detalhe do lead, histórico, filtros,
 * selects e badges leem SÓ daqui (direto, ou pelos aliases derivados em `comercial-engine.ts`).
 * Nunca repetir classes de cor de etapa em componente.
 *
 * Regras: a cor é INFORMAÇÃO, não decoração — só ponto, título/badge e marcas pequenas; superfície de
 * coluna e card continuam neutras. Nunca só cor: o rótulo sempre acompanha. Tons suaves (fundo
 * translúcido + texto escuro no claro / claro no escuro), sem neon, gradiente ou glow.
 * Sequência pensada para a leitura rápida do funil: azuis (início) → roxos (reuniões) →
 * quentes (proposta/negociação) → verde (ganho) / vermelho (perdido).
 * Ganho/Perdido/Contato/Proposta enviada usam os tokens semânticos do Design System
 * (success / danger / info / warning); as demais usam a paleta Tailwind já usada em outros módulos.
 */
export type StageVisual = {
  /** Ponto sólido (marcador). */
  dot: string;
  /** Badge suave: fundo translúcido + texto. */
  badge: string;
  /** Texto colorido (título/indicador da coluna). */
  text: string;
  /** Anel do destino do arrastar. */
  ring: string;
  /** Linha fina no topo da coluna (discreta). */
  bar: string;
};

export const COMMERCIAL_STAGE_VISUAL: Record<OpportunityStage, StageVisual> = {
  LEAD_RECEBIDO: {
    dot: "bg-sky-500",
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    text: "text-sky-700 dark:text-sky-300",
    ring: "ring-sky-500/40",
    bar: "bg-sky-500/50",
  },
  CONTATO_FEITO: {
    dot: "bg-info",
    badge: "bg-info-soft text-info-soft-foreground",
    text: "text-info-soft-foreground",
    ring: "ring-info/40",
    bar: "bg-info/50",
  },
  REUNIAO_AGENDADA: {
    dot: "bg-violet-500",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    text: "text-violet-700 dark:text-violet-300",
    ring: "ring-violet-500/40",
    bar: "bg-violet-500/50",
  },
  REUNIAO_REALIZADA: {
    dot: "bg-fuchsia-500",
    badge: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    ring: "ring-fuchsia-500/40",
    bar: "bg-fuchsia-500/50",
  },
  PROPOSTA_PREPARO: {
    dot: "bg-yellow-500",
    badge: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
    text: "text-yellow-700 dark:text-yellow-300",
    ring: "ring-yellow-500/40",
    bar: "bg-yellow-500/50",
  },
  PROPOSTA_ENVIADA: {
    dot: "bg-warning",
    badge: "bg-warning-soft text-warning-soft-foreground",
    text: "text-warning-soft-foreground",
    ring: "ring-warning/40",
    bar: "bg-warning/50",
  },
  NEGOCIACAO: {
    dot: "bg-orange-500",
    badge: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    text: "text-orange-700 dark:text-orange-300",
    ring: "ring-orange-500/40",
    bar: "bg-orange-500/50",
  },
  GANHO: {
    dot: "bg-success",
    badge: "bg-success-soft text-success-soft-foreground",
    text: "text-success-soft-foreground",
    ring: "ring-success/40",
    bar: "bg-success/50",
  },
  PERDIDO: {
    dot: "bg-danger",
    badge: "bg-danger-soft text-danger-soft-foreground",
    text: "text-danger-soft-foreground",
    ring: "ring-danger/40",
    bar: "bg-danger/50",
  },
};

/** Fallback para etapa desconhecida (dado legado/futuro): neutro, nunca quebra a tela. */
export const UNKNOWN_STAGE_VISUAL: StageVisual = {
  dot: "bg-muted-foreground/50",
  badge: "bg-muted text-text-secondary",
  text: "text-foreground",
  ring: "ring-foreground/30",
  bar: "bg-border",
};

export function stageVisual(stage: string | null | undefined): StageVisual {
  return (
    (stage ? COMMERCIAL_STAGE_VISUAL[stage as OpportunityStage] : undefined) ?? UNKNOWN_STAGE_VISUAL
  );
}
