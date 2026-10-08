import type { ClienteActivityEntry } from "@/lib/clientes-store";
import { accessAuditActionLabel } from "@/lib/access-audit-labels";

/**
 * Histórico do cliente = `cliente.activity[]` (qualquer pessoa com a permissão Clientes) + eventos
 * de acesso do `access_audit_log` (só quando o usuário pode consultá-lo). Texto sempre legível:
 * nada de JSON, e nenhum jargão de auditoria. Funções puras.
 */

export type HistoricoEvento = {
  id: string;
  at: string;
  /** Texto principal, já em linguagem de produto. */
  text: string;
  /** Pessoa associada (para o avatar), quando houver. */
  person?: string;
  /** Observação digitada pelo usuário (ex.: motivo de troca de status). */
  note?: string;
};

export type AuditRowLike = {
  id: string;
  action: string;
  created_at: string;
  target_user_id: string | null;
  actorEmail?: string | null;
};

export type MemberLike = { user_id: string; fullName: string | null; email: string | null };

/** Eventos de acesso que fazem sentido numa timeline de cliente (login/MFA/troca de ambiente não). */
const AUDIT_TEXT: Record<string, (who: string | null) => string> = {
  invite_sent: (w) =>
    w ? `Acesso ao portal concedido a ${w}` : "Convite de acesso ao portal enviado",
  invite_sent_existing_account: (w) =>
    w ? `Acesso ao portal concedido a ${w}` : "Acesso ao portal concedido",
  invite_resent: (w) => (w ? `Convite reenviado a ${w}` : "Convite de acesso reenviado"),
  invite_revoked: (w) => (w ? `Convite de ${w} revogado` : "Convite de acesso revogado"),
  role_changed: (w) => (w ? `Função de ${w} no portal alterada` : "Função de acesso alterada"),
  campaigns_changed: (w) =>
    w ? `Campanhas liberadas para ${w} alteradas` : "Campanhas liberadas alteradas",
  suspended: (w) => (w ? `Acesso de ${w} suspenso` : "Acesso ao portal suspenso"),
  member_suspended: (w) => (w ? `Acesso de ${w} suspenso` : "Acesso ao portal suspenso"),
  reactivated: (w) => (w ? `Acesso de ${w} reativado` : "Acesso ao portal reativado"),
  member_reactivated: (w) => (w ? `Acesso de ${w} reativado` : "Acesso ao portal reativado"),
  removed: (w) => (w ? `Acesso de ${w} removido` : "Acesso ao portal removido"),
  member_removed: (w) => (w ? `Acesso de ${w} removido` : "Acesso ao portal removido"),
  token_deactivated: () => "Link antigo do portal desativado",
};

export function isTimelineAuditAction(action: string): boolean {
  return action in AUDIT_TEXT;
}

function activityEvent(e: ClienteActivityEntry): HistoricoEvento {
  return {
    id: `activity:${e.id}`,
    at: e.createdAt,
    text: `${e.author} ${e.action}`.trim(),
    person: e.author || undefined,
    note: e.reason?.trim() || undefined,
  };
}

function auditEvent(r: AuditRowLike, members: readonly MemberLike[]): HistoricoEvento | null {
  const make = AUDIT_TEXT[r.action];
  if (!make) return null;
  const target = r.target_user_id ? members.find((m) => m.user_id === r.target_user_id) : undefined;
  const who = target?.fullName?.trim() || target?.email || null;
  return {
    id: `audit:${r.id}`,
    at: r.created_at,
    text: make(who),
    person: who ?? undefined,
  };
}

const DEDUP_WINDOW_MS = 60_000;

/** Mescla, ordena (mais recente primeiro) e remove repetições — o mesmo texto no mesmo minuto
 * (ex.: `suspended` e `member_suspended` gravados juntos). Sem `audit` (sem permissão), só activity. */
export function buildClienteHistorico(input: {
  activity: readonly ClienteActivityEntry[] | undefined;
  audit?: readonly AuditRowLike[] | null;
  members?: readonly MemberLike[];
}): HistoricoEvento[] {
  const events: HistoricoEvento[] = (input.activity ?? []).map(activityEvent);
  for (const r of input.audit ?? []) {
    const ev = auditEvent(r, input.members ?? []);
    if (ev) events.push(ev);
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  const out: HistoricoEvento[] = [];
  for (const ev of events) {
    const t = Date.parse(ev.at);
    const dup = out.some(
      (o) => o.text === ev.text && Math.abs(Date.parse(o.at) - t) <= DEDUP_WINDOW_MS,
    );
    if (!dup) out.push(ev);
  }
  return out;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "08 out." — com o ano quando não é o ano de referência. */
export function historicoDateLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const base = `${String(d.getDate()).padStart(2, "0")} ${MESES[d.getMonth()]}.`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export const HISTORICO_INICIAL = 8;

/** Rótulo genérico, caso algum dia um evento de auditoria sem texto próprio precise de fallback. */
export const fallbackAuditLabel = accessAuditActionLabel;
