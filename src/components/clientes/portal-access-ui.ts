/**
 * Apresentação de "Acessos ao portal": duas perguntas independentes.
 *  1) "Pode acessar?"  → ESTADO do acesso (o `status` real de `organization_members`).
 *  2) "Já acessou?"    → ATIVIDADE (último acesso real).
 * Nenhuma máquina de estados nova: invited → active (primeiro login) ↔ suspended; removed é final.
 * Funções puras.
 */

export type AccessMemberLike = {
  status: string;
  invited_at: string | null;
  accepted_at: string | null;
  last_access_at: string | null;
};

export type AccessTone = "success" | "warning" | "danger" | "muted";
export type AccessState = { label: string; tone: AccessTone; hint: string };

export const ACCESS_STATE: Record<string, AccessState> = {
  active: { label: "Ativo", tone: "success", hint: "Pode acessar o portal." },
  invited: {
    label: "Convite pendente",
    tone: "warning",
    hint: "Ainda não concluiu o primeiro acesso.",
  },
  suspended: {
    label: "Suspenso",
    tone: "danger",
    hint: "Cadastro mantido, acesso temporariamente bloqueado.",
  },
  removed: { label: "Revogado", tone: "danger", hint: "O acesso não está mais disponível." },
};

export function accessState(status: string): AccessState {
  return ACCESS_STATE[status] ?? { label: status, tone: "muted", hint: "" };
}

/**
 * Último acesso REAL: `last_access_at` (registrado a cada entrada) ou, para quem entrou antes desse
 * registro existir, `accepted_at` — o aceite do convite É o primeiro login (não há link separado;
 * ver `accept-invite.functions.ts`). Nunca usa data de convite, criação ou atualização.
 */
export function lastAccessAt(
  m: Pick<AccessMemberLike, "last_access_at" | "accepted_at">,
): string | null {
  const times = [m.last_access_at, m.accepted_at].filter((x): x is string => !!x);
  if (times.length === 0) return null;
  return times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
/** Dias de calendário entre `iso` e `now` (0 = hoje). */
export function calendarDaysAgo(iso: string, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
}

export function dateShort(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MESES[d.getMonth()]}. ${d.getFullYear()}`;
}

/** "hoje" / "ontem" / "há N dias" / "em 24 set. 2026" (a partir de 30 dias). */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const n = calendarDaysAgo(iso, now);
  if (n <= 0) return "hoje";
  if (n === 1) return "ontem";
  if (n < 30) return `há ${n} dias`;
  return `em ${dateShort(iso)}`;
}

export type AccessActivity = { text: string; title?: string };

/** Texto secundário da coluna Atividade. Convite pendente mostra o convite, não "Nunca acessou". */
export function accessActivity(m: AccessMemberLike, now: Date = new Date()): AccessActivity {
  if (m.status === "invited") {
    return m.invited_at
      ? {
          text: `Convite enviado ${relativeDay(m.invited_at, now)}`,
          title: fullDateTime(m.invited_at),
        }
      : { text: "Convite enviado" };
  }
  const last = lastAccessAt(m);
  if (!last) return { text: "Nunca acessou" };
  const rel = relativeDay(last, now);
  const text =
    m.status === "active"
      ? rel.startsWith("em ")
        ? `Último acesso ${rel}`
        : `Acessou ${rel}`
      : `Último acesso ${rel}`;
  return { text, title: fullDateTime(last) };
}

function fullDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export type MemberAction = "resend" | "role" | "campaigns" | "suspend" | "reactivate" | "remove";

/** Ações possíveis por estado (espelham o que o backend aceita; nada impossível aparece). */
export function memberActions(status: string): MemberAction[] {
  switch (status) {
    case "active":
      return ["role", "campaigns", "suspend", "remove"];
    case "invited":
      return ["resend", "role", "campaigns", "remove"];
    case "suspended":
      return ["reactivate", "role", "campaigns", "remove"];
    default:
      // Revogado é final: o domínio atual não tem reativar/reconvidar para ele.
      return [];
  }
}

/** Texto da ação de remover conforme o estado ("Revogar convite" enquanto pendente). */
export function removeActionLabel(status: string): string {
  return status === "invited" ? "Revogar convite" : "Remover acesso";
}
