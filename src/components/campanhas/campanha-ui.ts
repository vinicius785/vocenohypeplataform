/** Helpers puros da migração visual da listagem de Campanhas — status é
 * SEMPRE derivado de campos já existentes em `Campaign` (nunca um campo
 * novo): não há "status" persistido, então "ativa/encerrada/sem prazo" é
 * calculado exatamente com a mesma regra que já existia no KPI "ATIVAS"
 * da listagem antiga (`!prazo || prazo >= hoje`), só nomeada e reutilizada
 * em mais lugares (card, filtro, hero). Campanhas recorrentes não têm um
 * fim natural (a mesma campanha se repete mês a mês), por isso contam
 * sempre como "ativa" independente do campo `prazo`. */
import type { Campaign } from "@/components/VincularCampanhaDialog";
import type { Cliente } from "@/lib/clientes-store";
import type { Influ, Entrega } from "@/components/influenciadores/InfluencerBoard";
import { isInfluencerEligibleForDeliveries } from "@/lib/campanha-status";

export type CampanhaStatus = "ativa" | "encerrada" | "sem_prazo";

export const CAMPANHA_STATUS_LABEL: Record<CampanhaStatus, string> = {
  ativa: "Ativa",
  encerrada: "Encerrada",
  sem_prazo: "Sem prazo",
};

export function campanhaStatus(c: Campaign, today: Date): CampanhaStatus {
  if (c.pagClienteTipo === "Recorrente") return "ativa";
  if (!c.prazo) return "sem_prazo";
  return new Date(c.prazo) >= today ? "ativa" : "encerrada";
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
  today: Date,
  influsByCampanha: Map<string, { nome: string }[]>,
): CampanhaRow[] {
  return rows.filter((row) => {
    const influs = influsByCampanha.get(row.campanha.id) ?? [];
    if (
      !matchesSearch(
        row,
        query,
        influs.map((i) => i.nome),
      )
    )
      return false;
    if (filters.status !== "todos" && campanhaStatus(row.campanha, today) !== filters.status) {
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
