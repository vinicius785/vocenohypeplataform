import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * "Registrar follow-up" — o único caminho de escrita pra
 * `commercial_interactions` (nunca INSERT direto de outro lugar). Separado
 * de `comercial.functions.ts` porque é um domínio próprio (histórico
 * comercial factual, nunca editado depois), não uma variação de
 * upsertLead. RLS (`comercial insert own interactions`) já garante
 * `created_by = auth.uid()` e a permissão `comercial` no banco — este
 * handler nunca confia em `created_by`/`created_by_name` vindos do
 * cliente, sempre resolve o nome do autor no servidor.
 */

const INTERACTION_TYPES = ["whatsapp", "ligacao", "email", "reuniao", "outro"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

const OUTCOMES = [
  "respondeu",
  "nao_respondeu",
  "aguardando_retorno",
  "interessado",
  "sem_interesse",
  "proposta_solicitada",
  "reuniao_agendada",
] as const;
export type InteractionOutcome = (typeof OUTCOMES)[number];

export const INTERACTION_TYPE_LABEL: Record<InteractionType, string> = {
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  email: "E-mail",
  reuniao: "Reunião",
  outro: "Outro",
};

export const INTERACTION_OUTCOME_LABEL: Record<InteractionOutcome, string> = {
  respondeu: "Respondeu",
  nao_respondeu: "Não respondeu",
  aguardando_retorno: "Aguardando retorno",
  interessado: "Interessado",
  sem_interesse: "Sem interesse",
  proposta_solicitada: "Proposta solicitada",
  reuniao_agendada: "Reunião agendada",
};

const registerFollowUpSchema = z.object({
  opportunityId: z.string().uuid(),
  interactionType: z.enum(INTERACTION_TYPES),
  occurredAt: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida"),
  summary: z.string().trim().min(1, "Resumo é obrigatório").max(2000),
  outcome: z.enum(OUTCOMES).optional(),
  nextActionDescription: z.string().trim().max(300).optional(),
  nextActionAt: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida")
    .optional(),
});

export type CommercialInteractionRow = {
  id: string;
  opportunity_id: string;
  created_by: string;
  created_by_name: string;
  interaction_type: InteractionType;
  occurred_at: string;
  summary: string;
  outcome: InteractionOutcome | null;
  next_action_description: string | null;
  next_action_at: string | null;
  created_at: string;
  updated_at: string;
};

async function getActorName(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name || data?.email || "alguém";
}

/**
 * Registra o follow-up (interação real) E atualiza `leads.last_contact_at`/
 * `next_action_at`/`next_action_description` numa única chamada — nunca
 * dois passos separados que poderiam ficar inconsistentes se o segundo
 * falhar. `last_contact_at` só AVANÇA (GREATEST): se a data informada for
 * anterior ao contato mais recente já registrado, o registro entra no
 * histórico normalmente, mas `last_contact_at` não retrocede.
 */
export const registerFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof registerFollowUpSchema>) =>
    registerFollowUpSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS (`comercial read leads`) já garante que só quem tem permissão
    // comercial enxerga esta linha — um `opportunityId` de outra
    // organização/sem permissão simplesmente não retorna nada aqui.
    const { data: lead, error: leadErr } = await context.supabase
      .from("leads")
      .select("id, last_contact_at")
      .eq("id", data.opportunityId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Oportunidade não encontrada ou sem permissão de acesso.");

    const actorName = await getActorName(context.supabase, context.userId);

    const { data: inserted, error: insertErr } = await context.supabase
      .from("commercial_interactions")
      .insert({
        opportunity_id: data.opportunityId,
        created_by: context.userId,
        created_by_name: actorName,
        interaction_type: data.interactionType,
        occurred_at: data.occurredAt,
        summary: data.summary,
        outcome: data.outcome ?? null,
        next_action_description: data.nextActionDescription || null,
        next_action_at: data.nextActionAt ?? null,
      } as never)
      .select("*")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    const currentLastContact = (lead as { last_contact_at: string | null }).last_contact_at;
    const nextLastContact =
      !currentLastContact || new Date(data.occurredAt) > new Date(currentLastContact)
        ? data.occurredAt
        : currentLastContact;

    const leadUpdate: Record<string, unknown> = { last_contact_at: nextLastContact };
    // Só mexe na próxima ação quando o follow-up realmente informou uma —
    // "Sem próxima ação" no formulário envia `nextActionAt` vazio, que aqui
    // vira `null` explícito (limpa qualquer próxima ação anterior).
    if (data.nextActionAt !== undefined) {
      leadUpdate.next_action_at = data.nextActionAt || null;
      leadUpdate.next_action_description = data.nextActionDescription || null;
    }

    const { error: updateErr } = await context.supabase
      .from("leads")
      .update(leadUpdate as never)
      .eq("id", data.opportunityId);
    if (updateErr) throw new Error(updateErr.message);

    return inserted as unknown as CommercialInteractionRow;
  });

export const listFollowUps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { opportunityId: string }) =>
    z.object({ opportunityId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("commercial_interactions")
      .select("*")
      .eq("opportunity_id", data.opportunityId)
      .order("occurred_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows as unknown as CommercialInteractionRow[];
  });
