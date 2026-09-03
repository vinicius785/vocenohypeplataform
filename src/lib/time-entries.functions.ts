import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CorrectInput = z.object({
  id: z.string().uuid(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  note: z.string().max(500).optional(),
});

function durationBetween(startedAt: string, endedAt: string): number {
  return Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
}

/** Única via de correção de uma entrada de OUTRA pessoa — nunca cria
 * lançamento novo em nome de alguém, só ajusta um que já existe.
 * Edição da própria entrada usa `editOwnEntry` (time-entries.ts) direto,
 * sem selo de auditoria; aqui o selo é sempre gravado, porque é
 * exatamente o que torna a correção visível pra quem é dono da linha. */
export const correctTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CorrectInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: permError } = await context.supabase.rpc("has_permission", {
      _user_id: context.userId,
      _permission: "time",
    });
    if (permError) throw new Error(permError.message);
    if (!allowed)
      throw new Error("Sem permissão para corrigir registros de tempo de outras pessoas.");

    const { data: current, error: readError } = await context.supabase
      .from("time_entries")
      .select("*")
      .eq("id", data.id)
      .single();
    if (readError || !current) throw new Error(readError?.message ?? "Entrada não encontrada.");

    const startedAt = data.startedAt ?? current.started_at;
    const endedAt = data.endedAt ?? current.ended_at;

    const update: Record<string, unknown> = {
      started_at: startedAt,
      note: data.note ?? current.note,
      edited_by: context.userId,
      edited_at: new Date().toISOString(),
    };
    if (endedAt) {
      update.ended_at = endedAt;
      update.duration_seconds = durationBetween(startedAt, endedAt);
    }
    // Snapshot só na primeira correção — nunca sobrescreve um
    // original_* já gravado por uma correção anterior.
    if (current.original_started_at == null) {
      update.original_started_at = current.started_at;
      update.original_ended_at = current.ended_at;
    }

    const { error: writeError } = await context.supabase
      .from("time_entries")
      .update(update as never)
      .eq("id", data.id);
    if (writeError) throw new Error(writeError.message);

    return { success: true };
  });
