/**
 * Rascunho do formulário do perfil do lead e a conversão rascunho → `Lead`
 * (o que o autosave e a criação enviam ao servidor). Puro, sem React —
 * extraído do drawer para ser testável.
 *
 * REGRA CRÍTICA: o salvamento de campo (`upsertLead` em modo update) grava o
 * `extra` INTEIRO a partir do que recebe. Por isso o `Lead` enviado precisa
 * carregar tudo que o servidor devolveu (`...base`), não só os campos que o
 * formulário edita — senão qualquer edição apagaria em silêncio valores como
 * `propostaPublicToken` (link da calculadora externa), `lossReason`,
 * `giftType`, `aiSummary` e os `contact*`. Os campos do formulário
 * sobrescrevem; o resto é preservado como veio.
 */
import { legacyStage, type OpportunityStage } from "@/lib/comercial-engine";
import type { Lead, PropostaSnapshot } from "@/lib/comercial";

export type LeadDraft = {
  name: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  role: string;
  vertical: string;
  /** Texto digitado (orçamento mensal) — convertido só ao montar o `Lead`. */
  budget: string;
  urgency: string;
  experience: string;
  /** Texto digitado (valor do negócio, R$). */
  value: string;
  source: string;
  responsible: string;
  notes: string;
  score: number;
  stage: OpportunityStage;
  proposta: PropostaSnapshot | undefined;
};

export function leadToDraft(lead: Lead | null, initialStage?: OpportunityStage): LeadDraft {
  return {
    name: lead?.name ?? "",
    company: lead?.company ?? "",
    contact: lead?.contact ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    role: lead?.role ?? "",
    vertical: lead?.vertical ?? "",
    budget: lead?.budget ? String(lead.budget) : "",
    urgency: lead?.urgency ?? "",
    experience: lead?.experience ?? "",
    value: lead ? String(lead.value ?? "") : "",
    source: lead?.source ?? "",
    responsible: lead?.responsible ?? "",
    notes: lead?.notes ?? "",
    score: lead?.score ?? 0,
    stage: lead ? legacyStage(lead.stage) : (initialStage ?? "LEAD_RECEBIDO"),
    proposta: lead?.proposta,
  };
}

/** "R$ 1.500,50" / "1500.5" / "1500,5" → número; vazio ou inválido → 0. */
export function parseMoney(raw: string): number {
  return Number(raw.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
}

export function draftToLead(
  draft: LeadDraft,
  base: Lead | null,
  newId: () => string,
  now: number = Date.now(),
): Lead {
  return {
    ...(base ?? {}),
    id: base?.id ?? newId(),
    name: draft.name.trim(),
    company: draft.company.trim() || undefined,
    contact: draft.contact.trim() || undefined,
    email: draft.email.trim() || undefined,
    phone: draft.phone.trim() || undefined,
    role: draft.role.trim() || undefined,
    vertical: draft.vertical.trim() || undefined,
    budget: draft.budget.trim()
      ? Number(draft.budget.replace(/[^\d.,]/g, "").replace(",", "."))
      : undefined,
    urgency: (draft.urgency.trim() || undefined) as Lead["urgency"],
    experience: draft.experience.trim() || undefined,
    value: parseMoney(draft.value),
    proposta: draft.proposta,
    // Etapa é do motor: com lead salvo, nunca vem do formulário.
    stage: base ? base.stage : draft.stage,
    tags: base?.tags ?? [],
    source: draft.source || undefined,
    responsible: draft.responsible || undefined,
    notes: draft.notes.trim() || undefined,
    score: draft.score,
    activities: base?.activities ?? [],
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    stageEnteredAt: base?.stageEnteredAt ?? now,
  };
}
