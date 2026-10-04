/** Helpers puros da listagem/card de Campanhas.
 *
 * Status de campanha (Fase 1 da reconstrução): NUNCA mais derivado de
 * `prazo`/progresso/pendências — é um campo persistido explicitamente
 * (`Campaign.status`), com apenas 4 valores possíveis. Antes desta fase não
 * existia status persistido nenhum; "ativa/encerrada/sem_prazo" era
 * calculado na hora a partir de `prazo >= hoje`. Isso foi removido de
 * propósito: uma campanha com prazo vencido não vira "concluída" sozinha, e
 * uma sem prazo não fica "sem status" — o status é sempre o que alguém
 * escolheu por último (ou o valor de backfill da migração, ver
 * `20260928130000_campanha_status.sql`). */
import type {
  Campaign,
  CampanhaStatus,
  CampanhaActivityEntry,
} from "@/components/VincularCampanhaDialog";
import type { Cliente } from "@/lib/clientes-store";
import type { Influ, Entrega } from "@/lib/influencer-model";
import { isInfluencerEligibleForDeliveries } from "@/lib/campanha-status";

export type { CampanhaStatus, CampanhaActivityEntry };

export const CAMPANHA_STATUS_LABEL: Record<CampanhaStatus, string> = {
  planning: "Planejamento",
  active: "Ativa",
  completed: "Concluída",
  archived: "Arquivada",
};

/** Campanhas antigas (criadas antes desta fase) nunca tiveram `status`
 * gravado no momento da criação no cliente — a migration de backfill cobre
 * as que já existiam no banco quando ela rodou, mas qualquer linha nova
 * criada por um caminho que ainda não tenha sido atualizado cairia aqui.
 * "Planejamento" é o valor mais seguro pra uma campanha sem status conhecido
 * (nunca assume "Ativa" por conta própria). */
export function campanhaStatus(c: Campaign): CampanhaStatus {
  return c.status ?? "planning";
}

/** Transições válidas a partir de cada status, com o texto de AÇÃO (nunca
 * o nome cru do status de destino — pedido explícito: "Iniciar campanha",
 * não "Mudar para Ativa"). "Arquivar" existe a partir de qualquer status
 * (adicionado à parte, não faz sentido num "próximo passo" do fluxo
 * principal) — ver `archiveActionFor`. "Restaurar" não é uma transição
 * estática porque o destino depende de `statusBeforeArchive`. */
export const CAMPANHA_STATUS_TRANSITIONS: Record<
  CampanhaStatus,
  { to: CampanhaStatus; actionLabel: string; needsConfirm: boolean; confirmMessage?: string }[]
> = {
  planning: [{ to: "active", actionLabel: "Iniciar campanha", needsConfirm: false }],
  active: [
    {
      to: "completed",
      actionLabel: "Concluir campanha",
      needsConfirm: true,
      confirmMessage:
        "A campanha será marcada como concluída e deixará de aparecer entre as campanhas ativas. Seus dados continuarão disponíveis.",
    },
  ],
  completed: [
    {
      to: "active",
      actionLabel: "Reabrir campanha",
      needsConfirm: true,
      confirmMessage:
        "A campanha voltará a ser considerada ativa e retornará aos indicadores operacionais.",
    },
  ],
  archived: [], // restauração é tratada à parte (destino depende de statusBeforeArchive)
};

export const ARCHIVE_ACTION = {
  actionLabel: "Arquivar campanha",
  confirmMessage:
    "A campanha será removida das visualizações padrão, mas nenhum dado será apagado.",
} as const;

export function restoreConfirmMessage(target: CampanhaStatus): string {
  return `A campanha voltará ao status "${CAMPANHA_STATUS_LABEL[target]}".`;
}

/** Nome de quem está agindo, pro log de atividade — mesma convenção já
 * usada em `TaskBoard.tsx` (`getCurrentAuthor`, lê `config:perfil` do
 * localStorage), reaproveitada aqui em vez de inventar uma segunda fonte de
 * identidade só pra Campanhas. */
export function currentCampanhaActor(): string {
  if (typeof window === "undefined") return "Você";
  try {
    const raw = window.localStorage.getItem("config:perfil");
    if (raw) {
      const name = ((JSON.parse(raw) as { nome?: string }).nome ?? "").trim();
      if (name) return name;
    }
  } catch {
    /* ignore */
  }
  return "Você";
}

/** Monta o patch completo de uma troca de status — inclui o registro de
 * atividade (pedido: "Lucas Ragnoni alterou o status de Negociação para
 * Ativa") e os campos de auditoria (`statusChangedAt/By`). Arquivar guarda
 * o status anterior (`statusBeforeArchive`) pra restauração saber pra onde
 * voltar; restaurar limpa esse campo de novo. */
export function buildStatusChangePatch(
  campaign: Campaign,
  next: CampanhaStatus,
  reason?: string,
): Partial<Campaign> {
  const current = campanhaStatus(campaign);
  const author = currentCampanhaActor();
  const now = new Date().toISOString();
  const entry: CampanhaActivityEntry = {
    id: crypto.randomUUID(),
    author,
    action: `alterou o status de ${CAMPANHA_STATUS_LABEL[current]} para ${CAMPANHA_STATUS_LABEL[next]}`,
    createdAt: now,
    reason,
  };
  const patch: Partial<Campaign> = {
    status: next,
    statusChangedAt: now,
    statusChangedBy: author,
    activity: [...(campaign.activity ?? []), entry],
  };
  if (next === "archived") {
    patch.archivedAt = now;
    patch.archivedBy = author;
    patch.statusBeforeArchive = current;
  } else if (current === "archived") {
    patch.statusBeforeArchive = undefined;
  }
  return patch;
}

export type CampanhaRow = {
  cliente: Pick<Cliente, "id" | "empresa" | "photo">;
  campanha: Campaign;
};

export type CampanhaSortKey = "nome" | "prazo_proximo" | "prazo_distante" | "influenciadores";

export type CampanhaFiltersState = {
  status: "todos" | CampanhaStatus;
  clienteIds: string[];
  recorrente: "todos" | "sim" | "nao";
  influenciadores: "todos" | "com" | "sem";
  sort: CampanhaSortKey;
};

export const DEFAULT_CAMPANHA_FILTERS: CampanhaFiltersState = {
  status: "todos",
  clienteIds: [],
  recorrente: "todos",
  influenciadores: "todos",
  sort: "nome",
};

export const CAMPANHA_SORT_LABEL: Record<CampanhaSortKey, string> = {
  nome: "Nome (A–Z)",
  prazo_proximo: "Prazo mais próximo",
  prazo_distante: "Prazo mais distante",
  influenciadores: "Mais influenciadores",
};

export function countActiveCampanhaFilters(f: CampanhaFiltersState): number {
  let n = 0;
  if (f.status !== "todos") n += 1;
  if (f.clienteIds.length) n += 1;
  if (f.recorrente !== "todos") n += 1;
  if (f.influenciadores !== "todos") n += 1;
  return n;
}

function matchesSearch(row: CampanhaRow, query: string, influNomes: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [row.campanha.nome, row.cliente.empresa, ...influNomes].join(" ").toLowerCase();
  return haystack.includes(q);
}

export function filterCampanhas(
  rows: CampanhaRow[],
  query: string,
  filters: CampanhaFiltersState,
  influsByCampanha: Map<string, { nome: string }[]>,
  /** Quem a BUSCA por nome enxerga — por padrão o mesmo mapa da contagem;
   * a listagem passa todos os influenciadores aqui e só os aprovados em
   * `influsByCampanha` (que define o filtro "com/sem" e bate com o número
   * do card), pra buscar "Fulana" continuar achando a campanha mesmo que ela
   * ainda não tenha sido aprovada. */
  searchInflusByCampanha: Map<string, { nome: string }[]> = influsByCampanha,
): CampanhaRow[] {
  return rows.filter((row) => {
    const influs = influsByCampanha.get(row.campanha.id) ?? [];
    if (
      !matchesSearch(
        row,
        query,
        (searchInflusByCampanha.get(row.campanha.id) ?? []).map((i) => i.nome),
      )
    )
      return false;
    if (filters.status !== "todos" && campanhaStatus(row.campanha) !== filters.status) {
      return false;
    }
    if (filters.clienteIds.length > 0 && !filters.clienteIds.includes(row.cliente.id)) {
      return false;
    }
    const isRecorrente = row.campanha.pagClienteTipo === "Recorrente";
    if (filters.recorrente === "sim" && !isRecorrente) return false;
    if (filters.recorrente === "nao" && isRecorrente) return false;
    if (filters.influenciadores === "com" && influs.length === 0) return false;
    if (filters.influenciadores === "sem" && influs.length > 0) return false;
    return true;
  });
}

export function sortCampanhas(
  rows: CampanhaRow[],
  sort: CampanhaSortKey,
  influsByCampanha: Map<string, unknown[]>,
): CampanhaRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "nome":
      sorted.sort((a, b) => a.campanha.nome.localeCompare(b.campanha.nome, "pt-BR"));
      break;
    case "prazo_proximo":
      sorted.sort((a, b) => {
        if (!a.campanha.prazo && !b.campanha.prazo) return 0;
        if (!a.campanha.prazo) return 1;
        if (!b.campanha.prazo) return -1;
        return a.campanha.prazo.localeCompare(b.campanha.prazo);
      });
      break;
    case "prazo_distante":
      sorted.sort((a, b) => {
        if (!a.campanha.prazo && !b.campanha.prazo) return 0;
        if (!a.campanha.prazo) return 1;
        if (!b.campanha.prazo) return -1;
        return b.campanha.prazo.localeCompare(a.campanha.prazo);
      });
      break;
    case "influenciadores":
      sorted.sort((a, b) => {
        const na = influsByCampanha.get(a.campanha.id)?.length ?? 0;
        const nb = influsByCampanha.get(b.campanha.id)?.length ?? 0;
        return nb - na;
      });
      break;
  }
  return sorted;
}

/**
 * Usada em TODO lugar que soma/lista entregas/conteúdos da campanha —
 * nunca uma conta paralela. `isInfluencerEligibleForDeliveries` vem de
 * `campanha-status.ts` (evita import circular com `InfluencerBoard.tsx`,
 * que também precisa dela pra gatear a exibição por card). */
export function getEligibleCampaignInfluencers(influs: Influ[]): Influ[] {
  return influs.filter((i) => isInfluencerEligibleForDeliveries(i.status));
}

export type CampaignDelivery = { influ: Influ; entrega: Entrega };

export function getEligibleCampaignDeliveries(influs: Influ[]): CampaignDelivery[] {
  return getEligibleCampaignInfluencers(influs).flatMap((i) =>
    (i.entregas ?? []).map((entrega) => ({ influ: i, entrega })),
  );
}

/** Checklist informativo (não bloqueante) mostrado ao ativar uma campanha
 * (Negociação → Ativa, Fase 3). Só usa campos que já existem em `Campaign`
 * — não há campo de "responsável" na campanha, então ele não entra. */
export type CampanhaActivationCheck = { key: string; label: string; ok: boolean };

export function campanhaActivationChecklist(c: Campaign): CampanhaActivationCheck[] {
  const hasBriefing =
    (c.briefing ?? "").trim().length > 0 || !!c.briefingFile || (c.briefingLinks?.length ?? 0) > 0;
  return [
    { key: "briefing", label: "Briefing preenchido", ok: hasBriefing },
    {
      key: "valor",
      label: c.semFaturamento
        ? "Sem faturamento (valor não se aplica)"
        : "Valor do cliente definido",
      ok: c.semFaturamento ? true : (c.valorCliente ?? "").trim().length > 0,
    },
    {
      key: "pagamento",
      label: "Condição de pagamento do cliente definida",
      ok: c.semFaturamento ? true : !!c.pagClienteTipo,
    },
    { key: "prazo", label: "Prazo definido", ok: (c.prazo ?? "").trim().length > 0 },
    { key: "influs", label: "Influenciadores planejados", ok: (c.linhas?.length ?? 0) > 0 },
  ];
}

/**
 * Estado financeiro da campanha (item 15 da reconstrução do domínio
 * Comercial/Clientes/Campanhas/Contratos/Financeiro) — DISTINTO de
 * "gera ou não lançamento" (`buildEntries()`, que é um gate binário sobre
 * este estado). Quatro estados, nunca confundidos:
 *   "sem_faturamento" — condição explícita (`semFaturamento`), nunca
 *     sinônimo de valor zero.
 *   "estimado" — valor preenchido, mas a campanha ainda está em
 *     "planning" (ou o cliente ainda em "capture"): é uma estimativa
 *     comercial, nunca vira receita confirmada nem entra no fluxo de
 *     caixa realizado (`buildEntries()` já não gera nada pra este caso).
 *   "confirmado" — valor preenchido, campanha "active"/"completed" e
 *     cliente fora de "capture": é isso que vira lançamento de verdade.
 *   "nao_configurado" — nada preenchido ainda; estado de partida de toda
 *     campanha nova (nunca inferido como "R$ 0,00").
 */
export type CampanhaFinancialState =
  | "nao_configurado"
  | "estimado"
  | "confirmado"
  | "sem_faturamento";

export const CAMPANHA_FINANCIAL_STATE_LABEL: Record<CampanhaFinancialState, string> = {
  nao_configurado: "Financeiro não configurado",
  estimado: "Estimativa comercial",
  confirmado: "Financeiro confirmado",
  sem_faturamento: "Sem faturamento",
};

export function campanhaFinancialState(
  c: Campaign,
  clienteIsCapture: boolean,
): CampanhaFinancialState {
  if (c.semFaturamento) return "sem_faturamento";
  const hasValor = (c.valorCliente ?? "").trim().length > 0;
  if (!hasValor) return "nao_configurado";
  const status = campanhaStatus(c);
  const isPreOperational = status === "planning" || clienteIsCapture;
  return isPreOperational ? "estimado" : "confirmado";
}
