import { z } from "zod";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "./comercial-engine";

/**
 * Única fonte de verdade do que pode ser ordenado/filtrado no Pipe
 * Comercial — usada tanto pelo servidor (`comercial.functions.ts`, monta a
 * query real no Supabase) quanto pelo cliente (UI dos controles). Nenhum
 * campo/direção chega ao banco fora desta allowlist: o valor vindo da URL
 * é sempre validado contra este schema antes de virar `.order()`/filtro —
 * nunca concatenado.
 */

export const LEAD_SORT_FIELDS = [
  "created_at",
  "updated_at",
  "last_contact_at",
  "next_action_at",
  "stage_entered_at",
  "value",
  "probability",
  "expected_close_at",
  "name",
  "company",
] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

export type LeadSortDirection = "asc" | "desc";

/** Rótulos contextuais — nunca "Maior/mais antigo primeiro" genérico. */
export const LEAD_SORT_FIELD_LABEL: Record<LeadSortField, string> = {
  created_at: "Data de criação",
  updated_at: "Última atualização",
  last_contact_at: "Último contato",
  next_action_at: "Próxima ação",
  stage_entered_at: "Tempo parado",
  value: "Valor da oportunidade",
  probability: "Probabilidade de fechamento",
  expected_close_at: "Data prevista de fechamento",
  name: "Nome da empresa/contato",
  company: "Nome da empresa",
};

export const LEAD_SORT_DIRECTION_LABEL: Record<LeadSortField, Record<LeadSortDirection, string>> = {
  created_at: { desc: "mais recente", asc: "mais antiga" },
  updated_at: { desc: "mais recente", asc: "mais antiga" },
  last_contact_at: { asc: "mais antigo", desc: "mais recente" },
  next_action_at: { asc: "mais próxima", desc: "mais distante" },
  // "Tempo parado" maior = há mais tempo na etapa = stage_entered_at mais ANTIGO.
  stage_entered_at: { asc: "mais tempo parado", desc: "menos tempo parado" },
  value: { desc: "maior valor", asc: "menor valor" },
  probability: { desc: "maior probabilidade", asc: "menor probabilidade" },
  expected_close_at: { asc: "mais próximo", desc: "mais distante" },
  name: { asc: "A–Z", desc: "Z–A" },
  company: { asc: "A–Z", desc: "Z–A" },
};

export type LeadSortGroup = "Atividade comercial" | "Cadastro" | "Negócio";
export const LEAD_SORT_FIELD_GROUP: Record<LeadSortField, LeadSortGroup> = {
  last_contact_at: "Atividade comercial",
  next_action_at: "Atividade comercial",
  stage_entered_at: "Atividade comercial",
  updated_at: "Atividade comercial",
  created_at: "Cadastro",
  company: "Cadastro",
  name: "Cadastro",
  value: "Negócio",
  probability: "Negócio",
  expected_close_at: "Negócio",
};

export type LeadQuickSort = {
  key: string;
  label: string;
  sort: LeadSortField;
  direction: LeadSortDirection;
};

/**
 * As ÚNICAS 5 opções de ordenação expostas na interface (simplificação
 * pedida explicitamente — operação pequena, não um CRM enterprise). Cada
 * uma só preenche `sort`/`direction` reais da mesma allowlist de sempre,
 * nunca uma segunda lógica paralela. Os demais campos/direções continuam
 * suportados no backend/URL (nunca removidos), só não aparecem mais aqui.
 */
export const LEAD_QUICK_SORTS: LeadQuickSort[] = [
  { key: "mais_recentes", label: "Mais recentes", sort: "created_at", direction: "desc" },
  { key: "mais_antigos", label: "Mais antigos", sort: "created_at", direction: "asc" },
  {
    key: "sem_contato",
    label: "Sem contato há mais tempo",
    sort: "last_contact_at",
    direction: "asc",
  },
  { key: "proxima_acao", label: "Próxima ação", sort: "next_action_at", direction: "asc" },
  { key: "maior_valor", label: "Maior valor", sort: "value", direction: "desc" },
];

export const DEFAULT_LEAD_SORT: LeadSortField = "created_at";
export const DEFAULT_LEAD_DIRECTION: LeadSortDirection = "desc";

export type LeadDateRangeField =
  | "created_at"
  | "last_contact_at"
  | "next_action_at"
  | "updated_at"
  | "expected_close_at";

export type LeadActivityFilterKey =
  | "com_proxima_acao"
  | "sem_proxima_acao"
  | "acao_vencida"
  | "parado_3d"
  | "parado_5d"
  | "parado_7d"
  | "nunca_contatado"
  | "contatado_hoje"
  | "contatado_7d"
  | "sem_contato_7d"
  | "sem_contato_15d"
  | "sem_contato_30d";

export const LEAD_ACTIVITY_FILTER_LABEL: Record<LeadActivityFilterKey, string> = {
  com_proxima_acao: "Com próxima ação",
  sem_proxima_acao: "Sem próxima ação",
  acao_vencida: "Ação vencida",
  parado_3d: "Parado há mais de 3 dias",
  parado_5d: "Parado há mais de 5 dias",
  parado_7d: "Parado há mais de 7 dias",
  nunca_contatado: "Nunca contatado",
  contatado_hoje: "Contatado hoje",
  contatado_7d: "Contatado nos últimos 7 dias",
  sem_contato_7d: "Sem contato há 7 dias",
  sem_contato_15d: "Sem contato há 15 dias",
  sem_contato_30d: "Sem contato há 30 dias",
};

export type LeadStatusFilter = "aberto" | "ganho" | "perdido";

export type LeadFilters = {
  responsibles: string[];
  noResponsible: boolean;
  stages: OpportunityStage[];
  status: LeadStatusFilter[];
  origins: string[];
  tags: string[];
  activity: LeadActivityFilterKey[];
  dateRanges: Partial<Record<LeadDateRangeField, { from?: string; to?: string }>>;
  minValue?: number;
  maxValue?: number;
  minProbability?: number;
  maxProbability?: number;
};

export const EMPTY_LEAD_FILTERS: LeadFilters = {
  responsibles: [],
  noResponsible: false,
  stages: [],
  status: [],
  origins: [],
  tags: [],
  activity: [],
  dateRanges: {},
};

const isoDateSchema = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()));

const dateRangeSchema = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() });

export const leadFiltersSchema = z.object({
  responsibles: z.array(z.string().max(200)).max(50).default([]),
  noResponsible: z.boolean().default(false),
  stages: z.array(z.enum(OPPORTUNITY_STAGES)).default([]),
  status: z.array(z.enum(["aberto", "ganho", "perdido"])).default([]),
  origins: z.array(z.string().max(200)).max(50).default([]),
  tags: z.array(z.string().max(100)).max(50).default([]),
  activity: z
    .array(
      z.enum([
        "com_proxima_acao",
        "sem_proxima_acao",
        "acao_vencida",
        "parado_3d",
        "parado_5d",
        "parado_7d",
        "nunca_contatado",
        "contatado_hoje",
        "contatado_7d",
        "sem_contato_7d",
        "sem_contato_15d",
        "sem_contato_30d",
      ]),
    )
    .default([]),
  dateRanges: z
    .record(
      z.enum([
        "created_at",
        "last_contact_at",
        "next_action_at",
        "updated_at",
        "expected_close_at",
      ]),
      dateRangeSchema,
    )
    .default({}),
  minValue: z.number().nonnegative().optional(),
  maxValue: z.number().nonnegative().optional(),
  minProbability: z.number().min(0).max(100).optional(),
  maxProbability: z.number().min(0).max(100).optional(),
});

export const listLeadsInputSchema = z.object({
  sort: z.enum(LEAD_SORT_FIELDS).default(DEFAULT_LEAD_SORT),
  direction: z.enum(["asc", "desc"]).default(DEFAULT_LEAD_DIRECTION),
  search: z.string().max(200).optional(),
  filters: leadFiltersSchema.default(EMPTY_LEAD_FILTERS),
});
export type ListLeadsInput = z.infer<typeof listLeadsInputSchema>;

/** Valida um objeto solto (ex.: vindo da URL) contra o schema de filtros,
 * devolvendo sempre um `LeadFilters` seguro — qualquer chave/valor inválido
 * é ignorado (fallback seguro), nunca lança erro pro usuário só por causa
 * de uma URL compartilhada malformada. */
export function parseLeadFiltersSafe(raw: unknown): LeadFilters {
  const parsed = leadFiltersSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_LEAD_FILTERS;
}

/** `nullsFirst` por campo de ordenação — regras explícitas do pedido, nunca
 * o padrão do Postgres (que varia por tipo/direção sem significado
 * comercial): "sem contato há mais tempo" (last_contact_at ASC) traz quem
 * nunca foi contatado PRIMEIRO; toda ordenação por próxima ação/valor/
 * fechamento/nome traz o vazio por ÚLTIMO, independente da direção.
 */
export function nullsFirstForLeadSort(sort: LeadSortField, direction: LeadSortDirection): boolean {
  if (sort === "last_contact_at") return direction === "asc";
  return false;
}

/** Maior `createdAt` (epoch ms) entre atividades de contato comercial REAL
 * (ligação/e-mail/reunião) — nunca nota/tarefa/comentário interno. */
export function latestContactActivityIso(
  activities: { type: string; createdAt: number }[] | null | undefined,
): string | null {
  if (!Array.isArray(activities)) return null;
  const CONTACT_TYPES = new Set(["ligacao", "email", "reuniao"]);
  let max = -Infinity;
  for (const a of activities) {
    if (a && CONTACT_TYPES.has(a.type) && typeof a.createdAt === "number" && a.createdAt > max) {
      max = a.createdAt;
    }
  }
  return Number.isFinite(max) ? new Date(max).toISOString() : null;
}

/** `last_contact_at` só AVANÇA (GREATEST), nunca retrocede — mesmo que uma
 * atividade de contato antiga seja removida do array depois. */
export function nextLastContactAt(
  previous: string | null,
  candidateFromActivities: string | null,
): string | null {
  if (!candidateFromActivities) return previous;
  if (!previous) return candidateFromActivities;
  return new Date(candidateFromActivities).getTime() > new Date(previous).getTime()
    ? candidateFromActivities
    : previous;
}

export function countActiveLeadFilters(f: LeadFilters): number {
  let count = 0;
  if (f.responsibles.length > 0) count++;
  if (f.noResponsible) count++;
  if (f.stages.length > 0) count++;
  if (f.status.length > 0) count++;
  if (f.origins.length > 0) count++;
  if (f.tags.length > 0) count++;
  count += f.activity.length;
  count += Object.keys(f.dateRanges).length;
  if (f.minValue !== undefined || f.maxValue !== undefined) count++;
  if (f.minProbability !== undefined || f.maxProbability !== undefined) count++;
  return count;
}
