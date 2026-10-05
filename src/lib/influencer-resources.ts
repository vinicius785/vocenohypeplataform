import { contratoInfo, hasBankData, hasRemuneracao } from "@/lib/influencer-finance";
import { normalizePagamento, type Influ, type InfluencerFieldKey } from "@/lib/influencer-model";

/**
 * "Recursos" = camada de CONSULTA do detalhe do influenciador (perfil, financeiro, contexto,
 * inscrição, NPS, outros dados). Não contém ações genéricas (editar, remover, alterar status):
 * essas ficam no contexto delas. Este módulo só decide QUAIS recursos existem para um influenciador
 * e quais merecem um indicador de atenção — nenhuma regra de negócio nova.
 */
export type ResourceKey = "perfil" | "financeiro" | "contexto" | "inscricao" | "nps" | "outros";

export const RESOURCE_LABEL: Record<ResourceKey, string> = {
  perfil: "Perfil e audiência",
  financeiro: "Financeiro",
  contexto: "Contexto da campanha",
  inscricao: "Inscrição original",
  nps: "NPS",
  outros: "Outros dados",
};

export type ResourceItem = { key: ResourceKey; label: string; attention: boolean };

export type ResourceContext = {
  has: (k: InfluencerFieldKey) => boolean;
  /** Existe link de NPS para este influenciador (campanha com NPS). */
  hasNpsLink: boolean;
};

/** Quantas coisas ainda faltam no financeiro (remuneração, aprovação do pagamento, dados bancários,
 * contrato). Só conta o que o usuário enxerga e só para influenciador aprovado — antes disso não há
 * nada a resolver. A execução do pagamento (pago/vencido) vive no módulo Financeiro e não entra. */
export function financePendencies(
  influ: Pick<Influ, "status" | "pagamento" | "bank" | "contrato">,
  has: (k: InfluencerFieldKey) => boolean,
): number {
  if (influ.status !== "APROVADO") return 0;
  let n = 0;
  if (has("pagamentos")) {
    if (!hasRemuneracao(influ.pagamento)) n += 1;
    else {
      const a = normalizePagamento(influ.pagamento)?.aprovacao;
      if (a === "pendente" || a === "recusado") n += 1;
    }
  }
  if (has("bancario") && !hasBankData(influ.bank)) n += 1;
  if (has("contrato") && !contratoInfo(influ.contrato).present) n += 1;
  return n;
}

export function availableResources(influ: Influ, ctx: ResourceContext): ResourceItem[] {
  const out: ResourceItem[] = [];
  const add = (key: ResourceKey, attention = false) =>
    out.push({ key, label: RESOURCE_LABEL[key], attention });
  if (ctx.has("redes") || ctx.has("metricas")) add("perfil");
  if (ctx.has("pagamentos") || ctx.has("bancario") || ctx.has("contrato")) {
    add("financeiro", financePendencies(influ, ctx.has) > 0);
  }
  add("contexto");
  if (influ.submittedVia === "inscricao_page") add("inscricao");
  if (ctx.hasNpsLink) add("nps");
  if (influ.midiaKit && influ.midiaKit.length > 0) add("outros");
  return out;
}
