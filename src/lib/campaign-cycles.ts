import { supabase } from "@/integrations/supabase/client";
import { parseCicloMes } from "@/lib/ciclo-mes";

/** Devolve o id do ciclo (`campaign_cycles`) de uma campanha para o mês "YYYY-MM", criando-o se
 * ainda não existir. É o vínculo REAL (fonte de verdade) da participação de um influenciador num
 * mês — gravado em `campanha_influenciadores.campaign_cycle_id`. Nunca altera um ciclo existente
 * nem move influenciadores entre meses. `null` se o mês for inválido ou a escrita falhar (o
 * `cicloMes` do registro continua valendo como antes, sem quebrar a criação). */
export async function ensureCampaignCycleId(
  campanhaId: string,
  mes: string,
): Promise<string | null> {
  const p = parseCicloMes(mes);
  if (!p) return null;
  const find = async () => {
    const { data } = await supabase
      .from("campaign_cycles")
      .select("id")
      .eq("campanha_id", campanhaId)
      .eq("competence_year", p.year)
      .eq("competence_month", p.month)
      .maybeSingle();
    return data?.id ?? null;
  };
  try {
    const existing = await find();
    if (existing) return existing;
    const { data, error } = await supabase
      .from("campaign_cycles")
      .insert({ campanha_id: campanhaId, competence_year: p.year, competence_month: p.month })
      .select("id")
      .single();
    if (!error && data) return data.id;
    // Corrida (UNIQUE campanha+ano+mês): outra aba/pessoa criou no mesmo instante.
    return await find();
  } catch (e) {
    console.warn("[campaign-cycles] não foi possível garantir o ciclo", e);
    return null;
  }
}
