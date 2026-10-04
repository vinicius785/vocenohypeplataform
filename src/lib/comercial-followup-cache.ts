/**
 * Depois que o servidor grava um follow-up, a ficha do lead e o card precisam
 * refletir NA HORA (sem esperar a releitura): o registro entra no histórico e
 * a próxima ação/último contato mudam no lead. A releitura que vem depois só
 * confirma. A conta do lead é `applyFollowUpToLead` (espelho do servidor).
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Lead } from "@/lib/comercial";
import type { CommercialInteractionRow } from "@/lib/commercial-interactions.functions";
import { applyFollowUpToLead, type FollowUpInput } from "@/lib/comercial-followup-form";

export function applyFollowUpToCaches(
  queryClient: QueryClient,
  opportunityId: string,
  row: CommercialInteractionRow,
  input: FollowUpInput,
): void {
  // Histórico: só se ele já foi carregado (senão a primeira leitura traz tudo).
  queryClient.setQueryData<CommercialInteractionRow[]>(
    ["commercial-interactions", opportunityId],
    (old) =>
      old
        ? [row, ...old.filter((r) => r.id !== row.id)].sort(
            (a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at),
          )
        : old,
  );
  // Lead: em toda lista em cache (Comercial, Início…).
  queryClient.setQueriesData<Lead[]>({ queryKey: ["leads"] }, (old) =>
    Array.isArray(old)
      ? old.map((l) => (l.id === opportunityId ? applyFollowUpToLead(l, input) : l))
      : old,
  );
}
