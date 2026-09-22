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
import {
  listLeadsInputSchema,
  LEAD_SORT_FIELDS,
  nullsFirstForLeadSort,
  latestContactActivityIso,
  nextLastContactAt,
  type LeadFilters,
  type LeadSortDirection,
} from "./comercial-filters";

/** Valores crus possíveis no banco para cada etapa nova — inclui o valor
 * legado (6 strings curtas de antes) que ainda mapeia pra ela, pra filtro
 * por etapa continuar pegando registros antigos não reescritos. Única
 * fonte usada tanto pelo filtro de etapa quanto pelo filtro de status
 * (aberto/ganho/perdido). */
const LEGACY_STAGE_RAW_BY_NEW: Record<OpportunityStage, string[]> = {
  LEAD_RECEBIDO: ["LEAD_RECEBIDO", "lead"],
  CONTATO_FEITO: ["CONTATO_FEITO", "contato"],
  REUNIAO_AGENDADA: ["REUNIAO_AGENDADA"],
  REUNIAO_REALIZADA: ["REUNIAO_REALIZADA"],
  PROPOSTA_PREPARO: ["PROPOSTA_PREPARO", "proposta"],
  PROPOSTA_ENVIADA: ["PROPOSTA_ENVIADA"],
  NEGOCIACAO: ["NEGOCIACAO", "negociacao"],
  GANHO: ["GANHO", "ganho"],
  PERDIDO: ["PERDIDO", "perdido"],
};
const WON_RAW_STAGES = LEGACY_STAGE_RAW_BY_NEW.GANHO;
const LOST_RAW_STAGES = LEGACY_STAGE_RAW_BY_NEW.PERDIDO;
const OPEN_STAGE_KEYS = OPPORTUNITY_STAGES.filter((s) => s !== "GANHO" && s !== "PERDIDO");
const OPEN_RAW_STAGES = OPEN_STAGE_KEYS.flatMap((s) => LEGACY_STAGE_RAW_BY_NEW[s]);

/** Sanitiza um token de usuário antes de compor um filtro `.or()`/`.cs.`
 * do PostgREST — nunca concatenação livre de SQL, mas o formato de filtro
 * do PostgREST também é sensível a vírgula/parênteses/ponto-e-vírgula.
 * Remove esses caracteres em vez de tentar escapá-los (mais seguro: o pior
 * caso é o termo ficar levemente diferente, nunca quebra a query ou muda
 * de tabela/coluna). */
function sanitizeFilterToken(raw: string): string {
  return raw.replace(/[,()%*]/g, "").trim();
}

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
  stage_entered_at: string;
  last_contact_at: string | null;
  next_action_at: string | null;
  expected_close_at: string | null;
  probability: number | string | null;
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
    stageEnteredAt: new Date(row.stage_entered_at).getTime(),
    lastContactAt: row.last_contact_at ? new Date(row.last_contact_at).getTime() : undefined,
    nextActionAt: row.next_action_at ? new Date(row.next_action_at).getTime() : undefined,
    expectedCloseAt: row.expected_close_at ?? undefined,
    probability: row.probability !== null ? Number(row.probability) : undefined,
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
    propostaPublicToken: (extra.propostaPublicToken as string) ?? undefined,
    contactCompany: (extra.contactCompany as string) ?? undefined,
    contactPhone: (extra.contactPhone as string) ?? undefined,
    contactEmail: (extra.contactEmail as string) ?? undefined,
    contactRole: (extra.contactRole as string) ?? undefined,
    clienteId: (extra.clienteId as string) ?? undefined,
    projectId: (extra.projectId as string) ?? undefined,
    wonAt: (extra.wonAt as string) ?? undefined,
    lostAt: (extra.lostAt as string) ?? undefined,
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
  propostaPublicToken: z.string().optional(),
  contactCompany: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  contactRole: z.string().optional(),
  clienteId: z.string().optional(),
  projectId: z.string().optional(),
  stageLabel: z.string().optional(),
  expectedCloseAt: z.string().optional(),
  probability: z.number().min(0).max(100).optional(),
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
    "propostaPublicToken",
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
    next_action_at: input.nextMeeting || null,
    expected_close_at: input.expectedCloseAt || null,
    probability: input.probability ?? null,
    last_contact_at: null as string | null,
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
    "propostaPublicToken",
    "contactCompany",
    "contactPhone",
    "contactEmail",
    "contactRole",
    "clienteId",
    "projectId",
    "wonAt",
    "lostAt",
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
    next_action_at: lead.nextMeeting || null,
    expected_close_at: lead.expectedCloseAt || null,
    probability: lead.probability ?? null,
    last_contact_at: nextLastContactAt(
      lead.lastContactAt ? new Date(lead.lastContactAt).toISOString() : null,
      latestContactActivityIso(lead.activities),
    ),
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
      ...historyEntries.map((entry) => ({
        id: crypto.randomUUID(),
        type: "stage" as const,
        text: entry.text,
        createdAt: Date.now(),
        kind: entry.kind,
        fromStage: entry.fromStage,
        toStage: entry.toStage,
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

/** Filtro de atividade → predicado de query. Cada um mexe só nas colunas
 * que já existem — nenhuma lógica paralela às regras de nulos da
 * ordenação (mesma definição de "vencida"/"parado" usada em toda a UI). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyActivityFilter(query: any, key: LeadFilters["activity"][number]): any {
  const now = new Date().toISOString();
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  switch (key) {
    case "com_proxima_acao":
      return query.not("next_action_at", "is", null);
    case "sem_proxima_acao":
      return query.is("next_action_at", null);
    case "acao_vencida":
      return query.not("next_action_at", "is", null).lt("next_action_at", now);
    case "parado_3d":
      return query
        .lt("stage_entered_at", daysAgo(3))
        .not("stage", "in", `(${WON_RAW_STAGES.concat(LOST_RAW_STAGES).join(",")})`);
    case "parado_5d":
      return query
        .lt("stage_entered_at", daysAgo(5))
        .not("stage", "in", `(${WON_RAW_STAGES.concat(LOST_RAW_STAGES).join(",")})`);
    case "parado_7d":
      return query
        .lt("stage_entered_at", daysAgo(7))
        .not("stage", "in", `(${WON_RAW_STAGES.concat(LOST_RAW_STAGES).join(",")})`);
    case "nunca_contatado":
      return query.is("last_contact_at", null);
    case "contatado_hoje":
      return query.gte("last_contact_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    case "contatado_7d":
      return query.gte("last_contact_at", daysAgo(7));
    case "sem_contato_7d":
      return query.or(`last_contact_at.is.null,last_contact_at.lt.${daysAgo(7)}`);
    case "sem_contato_15d":
      return query.or(`last_contact_at.is.null,last_contact_at.lt.${daysAgo(15)}`);
    case "sem_contato_30d":
      return query.or(`last_contact_at.is.null,last_contact_at.lt.${daysAgo(30)}`);
  }
}

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listLeadsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { sort, direction, search, filters } = data;

    let query = context.supabase.from("leads").select("*") as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    // --- Filtros de pessoas/pipeline (lógica OR dentro do grupo) ---
    if (filters.noResponsible && filters.responsibles.length > 0) {
      const ors = [
        "responsible.is.null",
        `responsible.in.(${filters.responsibles.map(sanitizeFilterToken).join(",")})`,
      ];
      query = query.or(ors.join(","));
    } else if (filters.noResponsible) {
      query = query.is("responsible", null);
    } else if (filters.responsibles.length > 0) {
      query = query.in("responsible", filters.responsibles);
    }

    if (filters.stages.length > 0) {
      const rawValues = filters.stages.flatMap((s) => LEGACY_STAGE_RAW_BY_NEW[s]);
      query = query.in("stage", rawValues);
    }

    if (filters.status.length > 0) {
      const rawValues = filters.status.flatMap((s) =>
        s === "ganho" ? WON_RAW_STAGES : s === "perdido" ? LOST_RAW_STAGES : OPEN_RAW_STAGES,
      );
      query = query.in("stage", rawValues);
    }

    if (filters.origins.length > 0) {
      query = query.in("source", filters.origins);
    }

    if (filters.tags.length > 0) {
      const safeTags = filters.tags.map(sanitizeFilterToken).filter(Boolean);
      if (safeTags.length > 0) {
        query = query.or(safeTags.map((t) => `tags.cs.${JSON.stringify([t])}`).join(","));
      }
    }

    // --- Filtros de atividade (grupos diferentes = AND entre si) ---
    for (const key of filters.activity) {
      query = applyActivityFilter(query, key);
    }

    // --- Datas ---
    for (const [field, range] of Object.entries(filters.dateRanges)) {
      if (range?.from) query = query.gte(field, range.from);
      if (range?.to) query = query.lte(field, range.to);
    }

    // --- Valores ---
    if (filters.minValue !== undefined) query = query.gte("value", filters.minValue);
    if (filters.maxValue !== undefined) query = query.lte("value", filters.maxValue);
    if (filters.minProbability !== undefined)
      query = query.gte("probability", filters.minProbability);
    if (filters.maxProbability !== undefined)
      query = query.lte("probability", filters.maxProbability);

    // --- Busca ---
    if (search && search.trim()) {
      const term = sanitizeFilterToken(search.trim());
      if (term) {
        const digits = term.replace(/\D/g, "");
        const ors = [
          `name.ilike.%${term}%`,
          `company.ilike.%${term}%`,
          `contact.ilike.%${term}%`,
          `email.ilike.%${term}%`,
          `phone.ilike.%${term}%`,
          `responsible.ilike.%${term}%`,
        ];
        if (digits.length >= 4) ors.push(`phone.ilike.%${digits}%`);
        query = query.or(ors.join(","));
      }
    }

    // --- Ordenação (allowlist — nunca campo/direção livre vindo da URL) ---
    query = query
      .order(sort, {
        ascending: direction === "asc",
        nullsFirst: nullsFirstForLeadSort(sort, direction),
      })
      .order("id", { ascending: true });

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows as unknown as LeadRow[]).map(rowToLead);
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
        .select("extra, last_contact_at")
        .eq("id", data.id)
        .single();
      if (fetchErr) throw new Error(fetchErr.message);
      const existing = existingRow as {
        extra: Record<string, unknown>;
        last_contact_at: string | null;
      } | null;
      const prevExtra = (existing?.extra ?? {}) as Record<string, unknown>;
      row.extra.history = Array.isArray(prevExtra.history) ? prevExtra.history : [];
      row.last_contact_at = nextLastContactAt(
        existing?.last_contact_at ?? null,
        latestContactActivityIso(row.activities),
      );
      // Etapa, reunião agendada e a data de próxima ação (espelho de
      // `next_meeting`) são exclusivas do motor de pipeline
      // (`runOpportunityAction`/`updateLeadStage`) — nunca escritas por
      // este caminho de autosave genérico de campo. Sem isso, o `stage`
      // (e o `nextMeeting`) do estado local `liveLead` no drawer podia
      // ficar desatualizado (ex.: um drag-and-drop no Kanban mudou a
      // etapa enquanto o drawer do mesmo lead estava aberto) e um simples
      // autosave de outro campo revertia a etapa/apagava a reunião
      // silenciosamente, além de gerar uma segunda entrada de histórico
      // conflitante. `stage`/`next_meeting`/`next_action_at` só entram no
      // payload de criação (mais abaixo), nunca no de atualização.
      const rowUpdate: Partial<typeof row> = { ...row };
      delete rowUpdate.stage;
      delete rowUpdate.next_meeting;
      delete rowUpdate.next_action_at;
      const { data: updated, error } = await context.supabase
        .from("leads")
        .update(rowUpdate as never)
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
    row.last_contact_at = latestContactActivityIso(row.activities);
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
      ...historyEntries.map((entry) => ({
        id: crypto.randomUUID(),
        type: "stage" as const,
        text: entry.text,
        createdAt: Date.now(),
        kind: entry.kind,
        fromStage: entry.fromStage,
        toStage: entry.toStage,
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

/**
 * Gera (na lazy, uma única vez) o token do link externo da calculadora de
 * proposta deste lead (`/calculadora-proposta/$token`) — mesmo padrão de
 * `Cliente.publicToken` em `ClientesSection.tsx`'s `copyClientLink`, só que
 * gerado no servidor (não no cliente) porque a escrita precisa buscar o
 * `extra` atual antes de mesclar, pra nunca sobrescrever outro campo que
 * tenha mudado entre o load do formulário e este clique. Idempotente: se já
 * existe um token, devolve o mesmo — nunca gera um segundo link pro mesmo
 * lead. */
export const generatePropostaPublicToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existingRow, error: fetchErr } = await context.supabase
      .from("leads")
      .select("extra")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    const extra = ((existingRow as { extra: Record<string, unknown> } | null)?.extra ??
      {}) as Record<string, unknown>;
    const existingToken = extra.propostaPublicToken as string | undefined;
    if (existingToken) return { token: existingToken };

    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await context.supabase
      .from("leads")
      .update({ extra: { ...extra, propostaPublicToken: token } } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { token };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Visualizações salvas do Pipe Comercial — SEMPRE pessoais: RLS
 * (`comercial_saved_views`, `user_id = auth.uid()`) garante que uma
 * visualização de um usuário nunca é lida/alterada por outro, então este
 * arquivo não precisa reforçar isso na aplicação — só não permite alterar
 * o `user_id` de fora. */
export type SavedViewRow = {
  id: string;
  user_id: string;
  name: string;
  filters: Database["public"]["Tables"]["comercial_saved_views"]["Row"]["filters"];
  sort: string;
  direction: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const listSavedViews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("comercial_saved_views")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data as unknown as SavedViewRow[];
  });

const savedViewInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  filters: z.record(z.string(), z.any()),
  sort: z.enum(LEAD_SORT_FIELDS),
  direction: z.enum(["asc", "desc"] satisfies [LeadSortDirection, LeadSortDirection]),
  isDefault: z.boolean().optional(),
});

export const upsertSavedView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof savedViewInputSchema>) =>
    savedViewInputSchema.parse(input),
  )
  .handler(async ({ data, context }) => {
    // Só uma visualização padrão por usuário — se esta vai virar a padrão,
    // desmarca as outras primeiro (não dá pra confiar só no índice único
    // parcial pra isso: o índice IMPEDE duas padrão ao mesmo tempo, mas não
    // desmarca a antiga sozinho).
    if (data.isDefault) {
      await context.supabase
        .from("comercial_saved_views")
        .update({ is_default: false } as never)
        .eq("user_id", context.userId);
    }
    const row = {
      user_id: context.userId,
      name: data.name,
      filters: data.filters,
      sort: data.sort,
      direction: data.direction,
      is_default: data.isDefault ?? false,
    };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("comercial_saved_views")
        .update(row as never)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return updated as unknown as SavedViewRow;
    }
    const { data: inserted, error } = await context.supabase
      .from("comercial_saved_views")
      .insert(row as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted as unknown as SavedViewRow;
  });

export const deleteSavedView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("comercial_saved_views")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
