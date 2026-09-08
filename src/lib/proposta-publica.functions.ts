import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  TIERS,
  FORMATOS,
  calcPacote,
  custoUnitario,
  DEFAULT_PERCENTUAIS,
  EMPTY_CUSTOS,
  type PacoteLinha,
  type TierId,
  type FormatoId,
  type PricingPercentuais,
  type CustoTierFormato,
} from "@/lib/pricing";
import type { PropostaSnapshot } from "@/lib/comercial";

/**
 * Calculadora de proposta EXTERNA (`/calculadora-proposta/$token`) — link à
 * parte pro vendedor abrir durante uma call, mesmo espírito do portal do
 * cliente (`cliente-link.functions.ts`): nunca fala com Supabase direto do
 * browser, sempre via service-role aqui, porque nem `leads` nem
 * `pricing_settings` têm policy `anon`. DIFERENÇA DELIBERADA em relação ao
 * Simulador interno (`SimuladorPropostaDialog.tsx`): custo por
 * Tier×Formato e os percentuais da agência (imposto/comissão/bonificação/
 * margem) NUNCA saem do servidor — só o preço final (total e por linha) é
 * devolvido ao navegador do cliente/vendedor. Sem isso, qualquer pessoa com
 * o link poderia abrir as ferramentas de rede do navegador e ver a margem
 * de lucro da agência.
 */

// Tokens são `crypto.randomUUID().replace(/-/g, "")` (32 hex chars) — mesmo
// corte de `cliente-link.functions.ts`'s `TokenInput`, evita full-scan de
// `leads` por tentativa de token curto/inválido.
const TokenInput = z.object({ token: z.string().min(20).max(64) });

const TIER_IDS = TIERS.map((t) => t.id) as [TierId, ...TierId[]];
const FORMATO_IDS = FORMATOS.map((f) => f.id) as [FormatoId, ...FormatoId[]];

const PacoteLinhaPublic = z.object({
  id: z.string().min(1),
  tier: z.enum(TIER_IDS),
  formato: z.enum(FORMATO_IDS),
  qtd: z.number().int().min(1).max(1000),
});

type LeadPropostaPublicaInfo = {
  leadId: string;
  nome: string;
  empresa?: string;
  ultimaProposta?: { linhas: PacoteLinha[]; precoFinal: number };
};

async function findLeadByPropostaToken(token: string): Promise<LeadPropostaPublicaInfo | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("leads")
    .select("id, name, company, extra");
  if (error) throw new Error(error.message);
  for (const row of (rows ?? []) as {
    id: string;
    name: string;
    company: string | null;
    extra: Record<string, unknown> | null;
  }[]) {
    const extra = row.extra ?? {};
    if (extra.propostaPublicToken !== token) continue;
    const proposta = extra.proposta as PropostaSnapshot | undefined;
    return {
      leadId: row.id,
      nome: row.name,
      empresa: row.company ?? undefined,
      ultimaProposta: proposta
        ? {
            linhas: proposta.linhas.map((l) => ({
              id: crypto.randomUUID(),
              tier: l.tier as TierId,
              formato: l.formato as FormatoId,
              qtd: l.qtd,
            })),
            precoFinal: proposta.precoFinal,
          }
        : undefined,
    };
  }
  return null;
}

/** Config de precificação atual — sempre lida no servidor, nunca exposta
 * inteira ao cliente/vendedor (só o RESULTADO do cálculo sai desta função). */
async function resolvePricing(): Promise<{
  percentuais: PricingPercentuais;
  custos: CustoTierFormato;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("pricing_settings")
    .select("imposto_pct, comissao_pct, bonificacao_pct, margem_pct, custos_tier")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { percentuais: DEFAULT_PERCENTUAIS, custos: EMPTY_CUSTOS };
  return {
    percentuais: {
      imposto: Number(row.imposto_pct) || 0,
      comissao: Number(row.comissao_pct) || 0,
      bonificacao: Number(row.bonificacao_pct) || 0,
      margem: Number(row.margem_pct) || 0,
    },
    custos: { ...EMPTY_CUSTOS, ...((row.custos_tier as CustoTierFormato | null) ?? {}) },
  };
}

/** Calcula o preço final + a alocação PROPORCIONAL por linha (mesma fração
 * do custo de cada linha sobre o custo total, aplicada ao preço final) —
 * nunca devolve custo/percentuais brutos, só o preço já "destravado". */
async function runCalc(linhas: PacoteLinha[]) {
  const { percentuais, custos } = await resolvePricing();
  const resultado = calcPacote(linhas, custos, percentuais);
  const fator = resultado.custoTotal > 0 ? resultado.precoFinal / resultado.custoTotal : 0;
  const porLinha = linhas.map((l) => ({
    id: l.id,
    precoFinal: custoUnitario(custos, l.tier, l.formato) * Math.max(0, l.qtd || 0) * fator,
  }));
  return {
    precoFinal: resultado.precoFinal,
    porLinha,
    percentuais,
    custoTotal: resultado.custoTotal,
  };
}

/** Público, sem auth — dados iniciais da tela (nome/empresa do lead pra
 * personalizar o cabeçalho + a última simulação salva, se houver, pra
 * reabrir o link continuando de onde parou numa call anterior). */
export const getPropostaPublicaData = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => TokenInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findLeadByPropostaToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    return {
      leadNome: found.nome,
      leadEmpresa: found.empresa,
      ultimaProposta: found.ultimaProposta ?? null,
    };
  });

const CalcPropostaInput = TokenInput.extend({
  linhas: z.array(PacoteLinhaPublic).min(1).max(10),
});

/** Público, sem auth — recalcula o preço a cada mudança de linha durante a
 * call. Só entra aqui o suficiente pra montar o pacote (tier/formato/qtd);
 * NUNCA custo por tier ou percentuais da agência. */
export const calcPropostaPublica = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => CalcPropostaInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findLeadByPropostaToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const { precoFinal, porLinha } = await runCalc(data.linhas);
    return { precoFinal, porLinha };
  });

const SavePropostaInput = TokenInput.extend({
  linhas: z.array(PacoteLinhaPublic).min(1).max(10),
});

/** Público, sem auth — "Salvar esta simulação": grava o pacote mostrado ao
 * cliente como a `PropostaSnapshot` oficial do lead (mesmo campo que o
 * Simulador interno usa) e atualiza `value` do negócio, pra não ficar
 * desatualizado. Recalcula tudo de novo no servidor (nunca confia num
 * `precoFinal` vindo do navegador) — a mesma garantia de integridade de
 * `calcPropostaPublica`. Não muda etapa do funil nem grava histórico: é uma
 * decisão do time, feita de volta no Comercial, não deste link público. */
export const savePropostaPublica = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SavePropostaInput.parse(raw))
  .handler(async ({ data }) => {
    const found = await findLeadByPropostaToken(data.token);
    if (!found) throw new Error("Link não encontrado.");
    const { precoFinal, percentuais, custoTotal } = await runCalc(data.linhas);

    const snapshot: PropostaSnapshot = {
      linhas: data.linhas.map((l) => ({ tier: l.tier, formato: l.formato, qtd: l.qtd })),
      percentuais,
      custoTotal,
      precoFinal,
      precoCalculado: precoFinal,
      ajustadoManualmente: false,
      calculadoEm: Date.now(),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("leads")
      .select("extra")
      .eq("id", found.leadId)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    const extra = ((row as { extra: Record<string, unknown> } | null)?.extra ?? {}) as Record<
      string,
      unknown
    >;
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ extra: { ...extra, proposta: snapshot }, value: precoFinal } as never)
      .eq("id", found.leadId);
    if (error) throw new Error(error.message);
    return { ok: true, precoFinal };
  });
