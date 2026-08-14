import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Lead, LeadHistoryEntry, PropostaSnapshot } from "./comercial";
import { dispatchOutgoingWebhook } from "./outgoing-webhooks";

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
  proposta: z
    .object({
      linhas: z.array(z.object({ tier: z.string(), formato: z.string(), qtd: z.number() })),
      percentuais: z.object({
        imposto: z.number(),
        comissao: z.number(),
        bonificacao: z.number(),
        margem: z.number(),
      }),
      custoTotal: z.number(),
      precoFinal: z.number(),
      calculadoEm: z.number(),
    })
    .optional(),
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

export const updateLeadStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; stage: string; stageLabel?: string }) =>
    z.object({ id: z.string(), stage: z.string(), stageLabel: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const actorName = await getActorName(context.supabase, context.userId);
    const { data: existingRow, error: fetchErr } = await context.supabase
      .from("leads")
      .select("extra")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    const prevExtra = ((existingRow as { extra: Record<string, unknown> } | null)?.extra ??
      {}) as Record<string, unknown>;
    const prevHistory = Array.isArray(prevExtra.history)
      ? (prevExtra.history as LeadHistoryEntry[])
      : [];
    const history: LeadHistoryEntry[] = [
      ...prevHistory,
      {
        id: crypto.randomUUID(),
        type: "stage",
        text: `${actorName} moveu o lead para "${data.stageLabel ?? data.stage}"`,
        createdAt: Date.now(),
      },
    ];
    const { error } = await context.supabase
      .from("leads")
      .update({ stage: data.stage, extra: { ...prevExtra, history } })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.stage === "ganho") {
      void dispatchOutgoingWebhook("lead.won", { id: data.id, stage: data.stage });
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
