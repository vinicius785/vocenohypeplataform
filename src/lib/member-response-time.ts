/**
 * Tempo médio de resposta (Time V2 → Comunicação). SOMENTE agregados — o
 * banco (`get_member_response_time`) nunca devolve mensagem, remetente,
 * destinatário nem convo_id, e este módulo não tem nenhum tipo que
 * pudesse carregá-los. Definições completas no cabeçalho da migration
 * `20261002120000_member_response_time.sql`.
 */

export type ResponseTimeSegment = {
  answered: number;
  unanswered: number;
  averageSeconds: number | null;
  medianSeconds: number | null;
};

export type MemberResponseTime = {
  direct: ResponseTimeSegment;
  mention: ResponseTimeSegment;
  all: {
    answered: number;
    unanswered: number;
    averageSeconds: number | null;
    medianSeconds: number | null;
  };
};

export type ResponseTimeFilter = "all" | "direct" | "mention";

export type ResponseTimeRow = {
  direct_answered: number | null;
  direct_unanswered: number | null;
  direct_avg_seconds: number | null;
  direct_median_seconds: number | null;
  mention_answered: number | null;
  mention_unanswered: number | null;
  mention_avg_seconds: number | null;
  mention_median_seconds: number | null;
  all_avg_seconds: number | null;
  all_median_seconds: number | null;
};

export function mapResponseTimeRow(row: ResponseTimeRow | null | undefined): MemberResponseTime {
  const da = row?.direct_answered ?? 0;
  const du = row?.direct_unanswered ?? 0;
  const ma = row?.mention_answered ?? 0;
  const mu = row?.mention_unanswered ?? 0;
  return {
    direct: {
      answered: da,
      unanswered: du,
      averageSeconds: row?.direct_avg_seconds ?? null,
      medianSeconds: row?.direct_median_seconds ?? null,
    },
    mention: {
      answered: ma,
      unanswered: mu,
      averageSeconds: row?.mention_avg_seconds ?? null,
      medianSeconds: row?.mention_median_seconds ?? null,
    },
    all: {
      answered: da + ma,
      unanswered: du + mu,
      averageSeconds: row?.all_avg_seconds ?? null,
      medianSeconds: row?.all_median_seconds ?? null,
    },
  };
}

export function segmentOf(data: MemberResponseTime, filter: ResponseTimeFilter) {
  return data[filter];
}

/** "18 min", "2h 05min", "1d 3h" — nunca segundos soltos; "—" sem dado. */
export function formatResponseDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const totalMin = Math.max(0, Math.round(seconds / 60));
  if (totalMin < 1) return "< 1 min";
  if (totalMin < 60) return `${totalMin} min`;
  const totalHours = Math.floor(totalMin / 60);
  if (totalHours < 24) {
    const m = totalMin % 60;
    return m === 0 ? `${totalHours}h` : `${totalHours}h ${String(m).padStart(2, "0")}min`;
  }
  const days = Math.floor(totalHours / 24);
  const h = totalHours % 24;
  return h === 0 ? `${days}d` : `${days}d ${h}h`;
}

export type ResponseTimePeriod = "hoje" | "semana" | "mes" | "personalizado";

export const RESPONSE_PERIOD_LABEL: Record<ResponseTimePeriod, string> = {
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  personalizado: "Personalizado",
};

/** Intervalo [from, to) em horário local; semana começa na segunda. */
export function responsePeriodRange(
  period: Exclude<ResponseTimePeriod, "personalizado">,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "hoje") {
    return { from: start, to: new Date(start.getTime() + 24 * 3600 * 1000) };
  }
  if (period === "semana") {
    const dow = (start.getDay() + 6) % 7; // segunda = 0
    const from = new Date(start.getFullYear(), start.getMonth(), start.getDate() - dow);
    return { from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7) };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}
