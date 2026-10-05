// Server-only: versão com service-role de `ensureCampaignCycleId` (src/lib/campaign-cycles.ts) para
// fluxos sem sessão de time, como a inscrição pública. Nunca importar fora de handlers server-side.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { parseCicloMes } from "@/lib/ciclo-mes";

/** Id do ciclo (`campaign_cycles`) da campanha para o mês "YYYY-MM", criando se não existir.
 * `null` se o mês for inválido ou a escrita falhar — a participação ainda é criada com `cicloMes`. */
export async function ensureCampaignCycleIdAdmin(
  admin: SupabaseClient<Database>,
  campanhaId: string,
  mes: string | undefined,
): Promise<string | null> {
  const p = parseCicloMes(mes);
  if (!p) return null;
  const find = async () => {
    const { data } = await admin
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
    const { data, error } = await admin
      .from("campaign_cycles")
      .insert({ campanha_id: campanhaId, competence_year: p.year, competence_month: p.month })
      .select("id")
      .single();
    if (!error && data) return data.id;
    return await find(); // corrida no UNIQUE (campanha, ano, mês)
  } catch {
    return null;
  }
}
