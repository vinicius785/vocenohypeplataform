/**
 * Lógica pura da aba Proposta (UX): detectar alterações NÃO aplicadas e dizer,
 * em palavras, o que acontece ao aplicar o preço ao negócio. A fórmula do
 * preço continua toda em `pricing.ts` (`calcPacote`) — nada aqui calcula
 * custo, imposto, comissão, bonificação ou margem.
 */
import { formatBRL, type PropostaSnapshot } from "@/lib/comercial";

export type ProposalLineValue = { tier: string; formato: string; qtd: number };

export type ProposalFormValue = {
  linhas: ProposalLineValue[];
  /** Preço digitado por cima do calculado; `null` = usando o calculado. */
  precoManual: number | null;
};

/** O que a proposta salva "é" no formulário — base para saber se mudou. */
export function proposalBaseline(
  initial: PropostaSnapshot | undefined,
  defaultLine: ProposalLineValue,
): ProposalFormValue {
  return {
    linhas: initial?.linhas.length
      ? initial.linhas.map((l) => ({ tier: l.tier, formato: l.formato, qtd: l.qtd }))
      : [defaultLine],
    precoManual: initial?.ajustadoManualmente ? Math.round(initial.precoFinal) : null,
  };
}

export function isProposalDirty(current: ProposalFormValue, baseline: ProposalFormValue): boolean {
  if (current.precoManual !== baseline.precoManual) return true;
  if (current.linhas.length !== baseline.linhas.length) return true;
  return current.linhas.some((l, i) => {
    const b = baseline.linhas[i];
    return l.tier !== b.tier || l.formato !== b.formato || l.qtd !== b.qtd;
  });
}

/** "O valor do negócio passa de R$ 100.000 para R$ 374." / "…será R$ 374." / null se igual. */
export function valueImpactMessage(current: number, next: number): string | null {
  if (Math.round(current) === Math.round(next)) return null;
  return current > 0
    ? `O valor do negócio passa de ${formatBRL(current)} para ${formatBRL(next)}.`
    : `O valor do negócio será ${formatBRL(next)}.`;
}
