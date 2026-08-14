export type StageKey = string;

export type Stage = {
  key: StageKey;
  label: string;
  color: string; // tailwind bg color class for the top bar
};

export const DEFAULT_STAGES: Stage[] = [
  { key: "lead", label: "Lead recebido", color: "bg-sky-500" },
  { key: "contato", label: "Contato feito", color: "bg-indigo-500" },
  { key: "proposta", label: "Proposta enviada", color: "bg-violet-500" },
  { key: "negociacao", label: "Em negociação", color: "bg-amber-500" },
  { key: "ganho", label: "Ganhou", color: "bg-emerald-500" },
  { key: "perdido", label: "Perdeu", color: "bg-rose-500" },
];

export type Activity = {
  id: string;
  type: "nota" | "ligacao" | "email" | "reuniao" | "tarefa";
  text: string;
  createdAt: number;
  done?: boolean;
};

/** Registro automático de eventos do lead (criação, mudança de status, etc) —
 * gerado pelo servidor, diferente de `Activity` (que a pessoa cria manualmente). */
export type LeadHistoryEntry = {
  id: string;
  type: "created" | "stage" | "edit";
  text: string;
  createdAt: number;
};

/** Snapshot do Simulador de Proposta (Comercial) aplicado a este lead —
 * linhas de Tier×Formato×Qtd + percentuais usados no cálculo, guardados
 * pra referência de como o `value` foi calculado. Ver src/lib/pricing.ts. */
export type PropostaSnapshot = {
  linhas: { tier: string; formato: string; qtd: number }[];
  percentuais: { imposto: number; comissao: number; bonificacao: number; margem: number };
  custoTotal: number;
  precoFinal: number;
  calculadoEm: number;
};

export type Lead = {
  id: string;
  name: string; // deal name
  company?: string;
  contact?: string;
  email?: string;
  phone?: string;
  value: number; // BRL
  stage: StageKey;
  tags: string[];
  source?: string;
  responsible?: string;
  notes?: string;
  activities: Activity[];
  history?: LeadHistoryEntry[];
  createdAt: number;
  updatedAt: number;
  // Kommo-style extended fields
  nextMeeting?: string; // ISO date
  giftType?: string;
  lossReason?: string;
  language?: string;
  urgency?: "baixa" | "media" | "alta" | "";
  role?: string; // cargo
  vertical?: string;
  experience?: string;
  aiSummary?: string;
  budget?: number;
  /** Preenchido ao usar o Simulador de Proposta e aplicar o preço final ao
   * `value` deste lead — sobrevive à conversão em Cliente (ver
   * `Cliente.orcamentoSugerido`). */
  proposta?: PropostaSnapshot;
  score?: number;
  // contact block
  contactCompany?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactRole?: string;
  // Preenchido ao converter o lead em cliente/projeto (fecha o ciclo Comercial → Clientes/Projetos)
  clienteId?: string;
  projectId?: string;
};

const STAGES_KEY = "comercial:stages";

export function loadStages(): Stage[] {
  try {
    const raw = localStorage.getItem(STAGES_KEY);
    if (!raw) return DEFAULT_STAGES;
    const parsed = JSON.parse(raw) as Stage[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_STAGES;
    return parsed;
  } catch {
    return DEFAULT_STAGES;
  }
}

export function saveStages(list: Stage[]) {
  try {
    localStorage.setItem(STAGES_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}
