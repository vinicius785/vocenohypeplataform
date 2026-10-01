/**
 * NPS mensal obrigatório do Portal do Cliente — tabela `campanha_nps`
 * (`20260930130000_create_campanha_nps_table.sql`). A chave lógica de uma
 * resposta é `(campanhaId, referenceMonth)`, NUNCA `(userId,
 * referenceMonth)`: quem respondeu (`answeredBy`) é só auditoria — uma
 * campanha com 10 usuários com acesso ao portal precisa de UMA resposta
 * por mês, não uma por usuário (mesma regra em toda função que consulta
 * pendências, nunca reimplementada por componente).
 *
 * Diferente do NPS por relatório já existente
 * (`RelatorioMensal.nps`, em `relatorio-mensal.ts` — opcional, por PDF
 * específico), este é um gate mensal por campanha, obrigatório, que
 * bloqueia a navegação do portal enquanto pendente.
 */
import type { Campaign, CampanhaStatus } from "@/components/VincularCampanhaDialog";
import { campanhaStatus } from "@/components/campanhas/campanha-ui";
import { todayIsoInBrasilia } from "@/lib/timezone";

export type CampanhaNps = {
  id: string;
  clienteId: string;
  campanhaId: string;
  referenceMonth: string;
  score: number;
  comment: string | null;
  answeredBy: string | null;
  answeredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CampanhaNpsRow = {
  id: string;
  cliente_id: string;
  campanha_id: string;
  reference_month: string;
  score: number;
  comment: string | null;
  answered_by: string | null;
  answered_at: string;
  created_at: string;
  updated_at: string;
};

export function mapCampanhaNpsRow(r: CampanhaNpsRow): CampanhaNps {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    campanhaId: r.campanha_id,
    referenceMonth: r.reference_month,
    score: r.score,
    comment: r.comment,
    answeredBy: r.answered_by,
    answeredAt: r.answered_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Ciclo `YYYY-MM` de um mês de referência — sempre calculado a partir da
 * data real (nunca recebido do cliente): item 13 do pedido ("reference_month
 * válido" — nunca confiar em valor enviado pelo front). */
export function referenceMonthOf(date: Date): string {
  // Sempre no fuso de Brasília (nunca o fuso do processo/navegador): num
  // servidor em UTC, `getMonth()` viraria o mês ~21h antes da meia-noite
  // de Brasília do dia 1º.
  return todayIsoInBrasilia(date).slice(0, 7);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `campanha_nps.campanha_id` é `uuid` — valida antes de enviar ao banco. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function currentReferenceMonth(now: Date = new Date()): string {
  return referenceMonthOf(now);
}

const ELIGIBLE_STATUS: CampanhaStatus[] = ["active"];

/** Campanha elegível pra gerar pendência de NPS no mês: vinculada a um
 * cliente (sempre verdade — campanha só existe dentro de
 * `cliente.campanhas[]`), ativa/em execução (item 3: usa o status já
 * existente da campanha, nunca um status novo) e já iniciada
 * (`dataInicio` presente e não no futuro — nunca cobra NPS de campanha
 * que ainda não começou). */
export function isCampanhaElegivelParaNps(campanha: Campaign, now: Date = new Date()): boolean {
  if (!ELIGIBLE_STATUS.includes(campanhaStatus(campanha))) return false;
  if (!campanha.dataInicio) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(campanha.dataInicio)) return false;
  // Comparação de datas ISO (YYYY-MM-DD) em Brasília — independe do fuso
  // do processo.
  return campanha.dataInicio <= todayIsoInBrasilia(now);
}

/** Campanhas `active` que NÃO geram NPS por falta de `dataInicio` válida
 * (dado histórico incompleto). Decisão: continuam não elegíveis (nunca
 * cobra NPS sem saber se a campanha começou), mas o servidor registra um
 * aviso com estes ids pra não ficar silencioso — ver
 * `loadPendingNpsCampanhas` em portal-auth.functions.ts. */
export function campanhasAtivasSemDataInicio(campanhas: Campaign[]): Campaign[] {
  return campanhas.filter(
    (c) =>
      campanhaStatus(c) === "active" &&
      (!c.dataInicio || !/^\d{4}-\d{2}-\d{2}$/.test(c.dataInicio)),
  );
}

/** Campanhas elegíveis de um cliente que ainda não têm resposta de NPS no
 * mês de referência — a ÚNICA função que decide "NPS pendente" (item 12:
 * "Evitar duplicar essa lógica em vários componentes"). Usada tanto pelo
 * endpoint que lista pendências quanto pelo bloqueio de mutações
 * (`assertNpsResolvida`, portal-auth.functions.ts). */
export function campanhasComNpsPendente(
  campanhas: Campaign[],
  respondidas: CampanhaNps[],
  referenceMonth: string,
  now: Date = new Date(),
): Campaign[] {
  const respondidasIds = new Set(
    respondidas.filter((r) => r.referenceMonth === referenceMonth).map((r) => r.campanhaId),
  );
  return campanhas.filter((c) => isCampanhaElegivelParaNps(c, now) && !respondidasIds.has(c.id));
}
