import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeAccessState } from "@/lib/demo/demo-token";
import type { DemoEventRow, DemoSessionView } from "@/lib/demo/demo-types";

/** Todas as colunas de `demo_sessions` MENOS `token` (o time não pode ler o segredo do link). */
const SESSION_COLUMNS =
  "id, lead_id, cliente_id, campanha_id, organization_id, scenario, seed_version, status, " +
  "token_expires_at, access_revoked_at, closed_at, last_client_access_at, realtime_key, " +
  "created_by, created_at, updated_at";

export type CampaignDemo = { session: DemoSessionView; events: DemoEventRow[] } | null;

/**
 * Sessão de demonstração de uma campanha (e seus eventos de ciclo de vida), lida direto do
 * banco pela RLS da equipe interna. `null` = a campanha não é uma demo. Atualiza sozinho: o
 * cliente pode abrir o link ou o link pode expirar enquanto a tela está aberta.
 */
export function useCampaignDemo(campanhaId: string) {
  return useQuery<CampaignDemo>({
    queryKey: ["demo-da-campanha", campanhaId],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("demo_sessions" as never)
        .select(SESSION_COLUMNS)
        .eq("campanha_id", campanhaId)
        .maybeSingle();
      if (error) throw error;
      if (!row) return null;
      const s = row as unknown as Omit<DemoSessionView, "access">;
      const { data: events } = await supabase
        .from("demo_events" as never)
        .select("*")
        .eq("session_id", s.id)
        .order("created_at", { ascending: false })
        .limit(40);
      return {
        session: { ...s, access: computeAccessState(s, new Date()) },
        events: (events ?? []) as unknown as DemoEventRow[],
      };
    },
  });
}
