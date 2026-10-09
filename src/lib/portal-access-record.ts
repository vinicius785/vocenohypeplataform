import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Não regrava `last_access_at` se o último registro tem menos que isto (evita um UPDATE por navegação). */
export const ACCESS_RECORD_MIN_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registra que ESTE usuário entrou no portal na organização informada. Só toca a linha dele
 * (`user_id` + `organization_id`) e só se o vínculo está ATIVO — suspenso/revogado/convite pendente
 * não registram acesso. Uma única UPDATE condicional (sem leitura antes).
 */
export async function recordPortalAccessCore(
  admin: SupabaseClient<Database>,
  input: { userId: string; organizationId: string; now?: Date; device?: string | null },
): Promise<void> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - ACCESS_RECORD_MIN_INTERVAL_MS).toISOString();
  const { error } = await admin
    .from("organization_members")
    .update({
      last_access_at: now.toISOString(),
      ...(input.device ? { last_access_device: input.device } : {}),
    })
    .eq("user_id", input.userId)
    .eq("organization_id", input.organizationId)
    .eq("status", "active")
    .or(
      [
        "last_access_at.is.null",
        `last_access_at.lt.${cutoff}`,
        // Preenche quem ainda não tem aparelho e atualiza na hora se o aparelho mudou.
        ...(input.device
          ? ["last_access_device.is.null", `last_access_device.neq.${input.device}`]
          : []),
      ].join(","),
    );
  if (error) throw new Error(error.message);
}
