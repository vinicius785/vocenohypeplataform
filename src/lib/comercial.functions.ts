import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Lead, LeadHistoryEntry, PropostaSnapshot } from "./comercial";
import { dispatchOutgoingWebhook } from "./outgoing-webhooks";
import {
  applyOpportunityAction,
  legacyStage,
  OPPORTUNITY_STAGES,
  type OpportunityActionKind,
  type OpportunityStage,
} from "./comercial-engine";

const OPPORTUNITY_ACTION_KINDS = [
  "registrar_contato",
  "agendar_reuniao",
  "registrar_reuniao",
  "criar_proposta",
  "enviar_proposta",
  "revisar_proposta",
  "registrar_negociacao",
  "marcar_ganho",
  "marcar_perdido",
  "alterar_etapa_manual",
] as const satisfies readonly OpportunityActionKind[];

async function getActorName(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name || data?.email || "alguém";
}

type LeadRow = {
  id: string;
  name: string;
  company: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  value: number | string;
  stage: string;
  tags: unknown;
  source: string | null;
  responsible: string | null;
  notes: string | null;
  activities: unknown;
  next_meeting: string | null;
  source_form: string | null;
  extra: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function rowToLead(row: LeadRow): Lead {
  const extra = (row.extra ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    company: row.company ?? undefined,
    contact: row.contact ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    value: Number(row.value) || 0,
    stage: row.stage,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    source: row.source ?? undefined,
    responsible: row.responsible ?? undefined,
    notes: row.notes ?? undefined,
    activities: Array.isArray(row.activities) ? (row.activities as Lead["activities"]) : [],
    history: Array.isArray(extra.history) ? (extra.history as LeadHistoryEntry[]) : [],
    nextMeeting: row.next_meeting ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    role: (extra.role as string) ?? undefined,
    score: (extra.score as number) ?? undefined,
    giftType: (extra.giftType as string) ?? undefined,
    lossReason: (extra.lossReason as string) ?? undefined,
    language: (extra.language as string) ?? undefined,
    urgency: (extra.urgency as Lead["urgency"]) ?? undefined,
    vertical: (extra.vertical as string) ?? undefined,
    experience: (extra.experience as string) ?? undefined,
    aiSummary: (extra.aiSummary as string) ?? undefined,
    budget: (extra.budget as number) ?? undefined,
    proposta: (extra.proposta as PropostaSnapshot) ?? undefined,
    contactCompany: (extra.contactCompany as string) ?? undefined,
    contactPhone: (extra.contactPhone as string) ?? undefined,
    contactEmail: (extra.contactEmail as string) ?? undefined,
    contactRole: (extra.contactRole as string) ?? undefined,
    clienteId: (extra.clienteId as string) ?? undefined,
    projectId: (extra.projectId as string) ?? undefined,
  };
}

const propostaSchema = z.object({
  linhas: z.array(z.object({ tier: z.string(), formato: z.string(), qtd: z.number() })),
  percentuais: z.object({
    imposto: z.number(),
    comissao: z.number(),
    bonificacao: z.number(),
    margem: z.number(),
  }),
  custoTotal: z.number(),
  precoFinal: z.number(),
  precoCalculado: z.number().optional(),
  ajustadoManualmente: z.boolean().optional(),
  calculadoEm: z.number(),
});

const leadInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  company: z.string().optional(),
  contact: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  value: z.number().nonnegative().optional(),
  stage: z.string(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  responsible: z.string().optional(),
  notes: z.string().optional(),
  activities: z.array(z.any()).optional(),
  nextMeeting: z.string().optional(),
  role: z.string().optional(),
  score: z.number().optional(),
  giftType: z.string().optional(),
  lossReason: z.string().optional(),
  language: z.string().optional(),
  urgency: z.string().optional(),
  vertical: z.string().optional(),
  experience: z.string().optional(),
  aiSummary: z.string().optional(),
  budget: z.number().optional(),
  proposta: propostaSchema.optional(),
  contactCompany: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  contactRole: z.string().optional(),
  clienteId: z.string().optional(),
  projectId: z.string().optional(),
  stageLabel: z.string().optional(),
});

type LeadInput = z.infer<typeof leadInputSchema>;

function inputToRow(input: LeadInput) {
  const extra: Record<string, unknown> = {};
  const extraKeys: (keyof LeadInput)[] = [
    "role",
    "score",
    "giftType",
    "lossReason",
    "language",
    "urgency",
    "vertical",
    "experience",
    "aiSummary",
    "budget",
    "proposta",
    "contactCompany",
    "contactPhone",
    "contactEmail",
    "contactRole",
    "clienteId",
    "projectId",
  ];
  for (const k of extraKeys) {
    const v = input[k];
    if (v !== undefined && v !== "") extra[k] = v;
  }
  return {
    name: input.name,
    company: input.company || null,
    contact: input.contact || null,
    email: input.email || null,
    phone: input.phone || null,
    value: input.value ?? 0,
    stage: input.stage || "lead",
    tags: input.tags ?? [],
    source: input.source || null,
    responsible: input.responsible || null,
    notes: input.notes || null,
    activities: input.activities ?? [],
    next_meeting: input.nextMeeting || null,
    extra,
  };
}

/** Converte um `Lead` completo (já com o patch do motor aplicado) de volta
 * pra shape de linha do banco — mesmo mapeamento de `inputToRow`, mas a
 * partir do objeto `Lead` inteiro em vez do input validado do formulário.
 * Único ponto de escrita usado por `runOpportunityAction`, pra não haver
 * duas regras de "como salvar um lead" divergentes. */
function leadToRow(lead: Lead) {
  const extra: Record<string, unknown> = {};
  const extraKeys: (keyof Lead)[] = [
    "role",
    "score",
    "giftType",
    "lossReason",
    "language",
    "urgency",
    "vertical",
    "experience",
    "aiSummary",
    "budget",
    "proposta",
    "contactCompany",
    "contactPhone",
    "contactEmail",
    "contactRole",
    "clienteId",
    "projectId",
  ];
  for (const k of extraKeys) {
    const v = lead[k];
    if (v !== undefined && v !== "") extra[k] = v;
  }
  extra.history = lead.history ?? [];
  return {
    name: lead.name,
    company: lead.company || null,
    contact: lead.contact || null,
    email: lead.email || null,
    phone: lead.phone || null,
    value: lead.value ?? 0,
    stage: lead.stage,
    tags: lead.tags ?? [],
    source: lead.source || null,
    responsible: lead.responsible || null,
    notes: lead.notes || null,
    activities: lead.activities ?? [],
    next_meeting: lead.nextMeeting || null,
    extra,
  };
}

const opportunityActionSchema = z.object({
  id: z.string(),
  action: z.enum(OPPORTUNITY_ACTION_KINDS),
  data: z.string().optional(),
  proposta: propostaSchema.optional(),
  nota: z.string().optional(),
  novoValor: z.number().optional(),
  valorFinal: z.number().optional(),
  motivo: z.string().optional(),
  toStage: z.enum(OPPORTUNITY_STAGES).optional(),
});

/**
 * Único ponto de escrita orientada por ação do Comercial — AÇÃO → SISTEMA
 * ATUALIZA O ESTADO. Sempre passa pelo motor puro (`comercial-engine.ts`),
 * nunca monta o patch de etapa/valor/histórico na mão aqui — inclusive o
 * drag-and-drop do kanban chama isso com `action: "alterar_etapa_manual"`
 * (ver `updateLeadStage` abaixo), pra nunca existir um segundo caminho de
 * escrita sem histórico.
 */
export const runOpportunityAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof opportunityActionSchema>) =>
    opportunityActionSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    const actorName = await getActorName(context.supabase, context.userId);
    const { data: existingRow, error: fetchErr } = await context.supabase
      .from("leads")
      .select("*")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    const lead = rowToLead(existingRow as unknown as LeadRow);

    const { patch, historyEntries } = applyOpportunityAction(
      lead,
      data.action as OpportunityActionKind,
      actorName,
      {
        data: data.data,
        proposta: data.proposta as PropostaSnapshot | undefined,
        nota: data.nota,
        novoValor: data.novoValor,
        valorFinal: data.valorFinal,
        motivo: data.motivo,
        toStage: data.toStage as OpportunityStage | undefined,
      },
    );
    const history: LeadHistoryEntry[] = [
      ...(lead.history ?? []),
      ...historyEntries.map((text) => ({
        id: crypto.randomUUID(),
        type: "stage" as const,
        text,
        createdAt: Date.now(),
      })),
    ];
    const merged: Lead = { ...lead, ...patch, history };
    const row = leadToRow(merged);

    const { data: updated, error } = await context.supabase
      .from("leads")
      .update(row as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const result = rowToLead(updated as unknown as LeadRow);
    if (result.stage === "GANHO") {
      // Payload do webhook de saída preserva o valor legado "ganho" — é um
      // contrato de integração externa (Zapier/Make etc), não deve mudar
      // só porque o valor interno de `stage` ficou mais granular.
      void dispatchOutgoingWebhook("lead.won", { id: data.id, stage: "ganho" });
    }
    return result;
  });

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as unknown as LeadRow[]).map(rowToLead);
  });

export const upsertLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: LeadInput) => leadInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const row = inputToRow(data);
    const actorName = await getActorName(context.supabase, context.userId);
    if (data.id) {
      const { data: existingRow, error: fetchErr } = await context.supabase
        .from("leads")
        .select("stage, extra")
        .eq("id", data.id)
        .single();
      if (fetchErr) throw new Error(fetchErr.message);
      const prevExtra = ((existingRow as { extra: Record<string, unknown> } | null)?.extra ??
        {}) as Record<string, unknown>;
      const prevHistory = Array.isArray(prevExtra.history)
        ? (prevExtra.history as LeadHistoryEntry[])
        : [];
      const history = [...prevHistory];
      const prevStage = (existingRow as { stage: string } | null)?.stage;
      if (prevStage && prevStage !== data.stage) {
        history.push({
          id: crypto.randomUUID(),
          type: "stage",
          text: `${actorName} moveu o lead para "${data.stageLabel ?? data.stage}"`,
          createdAt: Date.now(),
        });
      }
      row.extra.history = history;
      const { data: updated, error } = await context.supabase
        .from("leads")
        .update(row as never)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return rowToLead(updated as unknown as LeadRow);
    }
    row.extra.history = [
      {
        id: crypto.randomUUID(),
        type: "created",
        text: `Lead criado por ${actorName}`,
        createdAt: Date.now(),
      },
    ] satisfies LeadHistoryEntry[];
    const { data: inserted, error } = await context.supabase
      .from("leads")
      .insert(row as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const lead = rowToLead(inserted as unknown as LeadRow);
    void dispatchOutgoingWebhook("lead.created", lead as unknown as Record<string, unknown>);
    return lead;
  });

/** Mantido pelo drag-and-drop do kanban (e por qualquer chamador antigo) —
 * mas por baixo é só um atalho pra `runOpportunityAction` com
 * `alterar_etapa_manual`. O drag-and-drop nunca foi um segundo motor de
 * status independente: ele sempre passou por uma escrita própria aqui,
 * mas agora essa escrita usa a mesma regra central do motor (histórico
 * com de/para, mesmo formato de texto), em vez de montar o patch na mão. */
export const updateLeadStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; stage: string; stageLabel?: string }) =>
    z.object({ id: z.string(), stage: z.string(), stageLabel: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const actorName = await getActorName(context.supabase, context.userId);
    const { data: existingRow, error: fetchErr } = await context.supabase
      .from("leads")
      .select("*")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    const lead = rowToLead(existingRow as unknown as LeadRow);
    const toStage = legacyStage(data.stage);

    const { patch, historyEntries } = applyOpportunityAction(
      lead,
      "alterar_etapa_manual",
      actorName,
      { toStage },
    );
    const history: LeadHistoryEntry[] = [
      ...(lead.history ?? []),
      ...historyEntries.map((text) => ({
        id: crypto.randomUUID(),
        type: "stage" as const,
        text,
        createdAt: Date.now(),
      })),
    ];
    const merged: Lead = { ...lead, ...patch, history };
    const row = leadToRow(merged);

    const { error } = await context.supabase
      .from("leads")
      .update(row as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (toStage === "GANHO") {
      void dispatchOutgoingWebhook("lead.won", { id: data.id, stage: "ganho" });
    }
    return { ok: true };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
