/**
 * Tempo médio de resposta (Time V2 → Comunicação). SOMENTE agregados — o
 * banco (`get_member_response_time`) nunca devolve mensagem, remetente,
 * destinatário nem convo_id, e este módulo não tem nenhum tipo que
 * pudesse carregá-los. Definições completas no cabeçalho da migration
 * `20261002120000_member_response_time.sql`.
 *
 * TEMPO ÚTIL: o tempo de cada demanda é calculado no banco por `business_seconds_between`
 * (só 09:00–19:00, America/Sao_Paulo — ver `agency-hours.ts`); os `*_seconds` daqui já são
 * segundos ÚTEIS. Nenhum cálculo de horário acontece no front-end.
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

/** Mínimo de demandas respondidas pra uma média/mediana ser exibida. Decisão de produto: a métrica
 * aparece desde a PRIMEIRA resposta (era 3 por privacidade; migration
 * `20261006040000_response_time_no_min_sample.sql`). A RPC aplica o mesmo valor; repetido aqui só
 * como defesa em profundidade no mapeamento do servidor. */
export const MIN_RESPONSE_SAMPLE = 1;

const gate = (answered: number, value: number | null | undefined) =>
  answered >= MIN_RESPONSE_SAMPLE ? (value ?? null) : null;

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
      averageSeconds: gate(da, row?.direct_avg_seconds),
      medianSeconds: gate(da, row?.direct_median_seconds),
    },
    mention: {
      answered: ma,
      unanswered: mu,
      averageSeconds: gate(ma, row?.mention_avg_seconds),
      medianSeconds: gate(ma, row?.mention_median_seconds),
    },
    all: {
      answered: da + ma,
      unanswered: du + mu,
      averageSeconds: gate(da + ma, row?.all_avg_seconds),
      medianSeconds: gate(da + ma, row?.all_median_seconds),
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

/** Linha do agregado do time (`get_team_response_time`): membro, nº de
 * demandas respondidas e média — nada mais. */
export type TeamResponseTimeRow = {
  member_id: string;
  answered_count: number | null;
  average_seconds: number | null;
};

export type TeamResponseTime = {
  byMemberId: Map<string, { answered: number; averageSeconds: number | null }>;
  /** Média de TODAS as demandas respondidas do time (ponderada pelo nº de
   * respondidas de cada um — equivale à média sobre o conjunto inteiro).
   * Só entram membros com ao menos uma resposta. */
  teamAverageSeconds: number | null;
};

export function mapTeamResponseRows(
  rows: TeamResponseTimeRow[] | null | undefined,
): TeamResponseTime {
  const byMemberId = new Map<string, { answered: number; averageSeconds: number | null }>();
  let weighted = 0;
  let base = 0;
  for (const r of rows ?? []) {
    const answered = r.answered_count ?? 0;
    const averageSeconds = gate(answered, r.average_seconds);
    byMemberId.set(r.member_id, { answered, averageSeconds });
    if (averageSeconds != null) {
      weighted += averageSeconds * answered;
      base += answered;
    }
  }
  return { byMemberId, teamAverageSeconds: base > 0 ? weighted / base : null };
}
