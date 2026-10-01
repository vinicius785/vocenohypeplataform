/**
 * Funções puras do Banco de Influenciadores V2 — extraídas (não
 * duplicadas) da implementação atual (`InfluenciadoresSection.tsx`),
 * com uma diferença: devolvem também o STATUS DA CAMPANHA
 * (`CampanhaStatus`), exibido só como contexto no histórico — a
 * elegibilidade pra "Avaliar influenciador" NÃO usa este campo (nem
 * prazo da campanha): é decidida por participação, comparando entregas
 * previstas x publicadas daquele influenciador (`InfluencerBancoDrawer`,
 * `producaoResumo`), já que outras partes da campanha podem seguir em
 * andamento enquanto a dele já terminou.
 */
import type { Cliente } from "@/lib/clientes-store";
import type { CampanhaStatus } from "@/components/VincularCampanhaDialog";
import type { BankInflu } from "@/lib/banco-influs-store";
import type { Influ } from "@/components/influenciadores/InfluencerBoard";
import { getAllCampanhaInflus } from "@/lib/campanha-scoped-store";
import { campanhaStatus } from "@/components/campanhas/campanha-ui";
import { producaoResumo } from "@/components/influenciadores/InfluencerBoard";

export type ParticipacaoCampanha = {
  clienteId: string;
  clienteEmpresa: string;
  campanhaId: string;
  campanhaNome: string;
  campanhaStatus: CampanhaStatus;
  campDataInicio?: string;
  campPrazo?: string;
  /** Status do INFLUENCIADOR dentro dessa campanha (APROVADO/RECUSADO/...),
   * nunca confundir com `campanhaStatus` acima. */
  influStatus: Influ["status"];
  /** `influ.id` — mesmo id de `campanha_influenciadores`, a "participação"
   * a que a avaliação manual e o NPS do influenciador já se prendem. */
  campanhaInfluenciadorId: string;
  influ: Influ;
};

/** Todas as participações EFETIVAS (`influStatus === "APROVADO"`) de um
 * influenciador do Banco em TODAS as campanhas de TODOS os clientes —
 * casamento por nome (mesma lógica já usada hoje; não existe FK real
 * entre Banco e campanhas ainda, ver contexto do plano). Ser adicionado a
 * uma campanha não é participação: RECUSADO/INSCRITO/EM_CURADORIA/
 * ENVIADO_AO_CLIENTE nunca entram no histórico, no contador "X campanhas"
 * nem habilitam avaliação/NPS — regra de negócio explícita, não um filtro
 * de UI opcional. `allCampanhaInflus` é um parâmetro (não recalculado
 * aqui dentro) pra quem chamar em lote (lista inteira do Banco) poder
 * computar `getAllCampanhaInflus()` uma vez só. */
export function findParticipacoes(
  nome: string,
  clientes: Cliente[],
  allCampanhaInflus: Map<string, Influ[]> = getAllCampanhaInflus(),
): ParticipacaoCampanha[] {
  const norm = nome.trim().toLowerCase();
  if (!norm) return [];
  const out: ParticipacaoCampanha[] = [];
  for (const c of clientes) {
    for (const camp of c.campanhas ?? []) {
      const arr = allCampanhaInflus.get(camp.id) ?? [];
      for (const inf of arr) {
        if (inf.status === "APROVADO" && inf.nome?.trim().toLowerCase() === norm) {
          out.push({
            clienteId: c.id,
            clienteEmpresa: c.empresa,
            campanhaId: camp.id,
            campanhaNome: camp.nome,
            campanhaStatus: campanhaStatus(camp),
            campDataInicio: camp.dataInicio,
            campPrazo: camp.prazo,
            influStatus: inf.status,
            campanhaInfluenciadorId: inf.id,
            influ: inf,
          });
        }
      }
    }
  }
  return out.sort((a, b) => (b.campDataInicio ?? "").localeCompare(a.campDataInicio ?? ""));
}

/** Elegibilidade pra "Avaliar influenciador" — unidade é a PARTICIPAÇÃO,
 * nunca a campanha inteira nem seu prazo: o influenciador já está
 * aprovado (garantido por `findParticipacoes`, que só devolve
 * participações `APROVADO`) e TODAS as entregas previstas pra ele já
 * foram publicadas. Não basta existir alguma entrega publicada — compara
 * previstas x concluídas (`producaoResumo`). Uma campanha com 0 entregas
 * previstas nunca fica "pronta" (nada foi efetivamente produzido ainda). */
export function participacaoProntaParaAvaliacao(p: Pick<ParticipacaoCampanha, "influ">): boolean {
  const resumo = producaoResumo(p.influ.entregas);
  return resumo.total > 0 && resumo.publicadas === resumo.total;
}

// ---------------------------------------------------------------------------
// Filtros — mesmo formato de `campanha-ui.ts`'s `CampanhaFiltersState`
// (objeto simples + default + contagem de ativos + função pura de filtro).

export type InfluencerBancoSort = "recentes" | "nome" | "seguidores" | "campanhas" | "avaliacao";

export type InfluencerBancoFiltersState = {
  nicho: string;
  rede: string;
  seguidoresMin: string;
  comHistorico: "" | "com" | "sem";
  avaliado: "" | "avaliado" | "nao_avaliado";
  notaMin: string;
  sort: InfluencerBancoSort;
};

export const DEFAULT_INFLUENCER_BANCO_FILTERS: InfluencerBancoFiltersState = {
  nicho: "",
  rede: "",
  seguidoresMin: "",
  comHistorico: "",
  avaliado: "",
  notaMin: "",
  sort: "recentes",
};

export function countActiveInfluencerBancoFilters(f: InfluencerBancoFiltersState): number {
  return [f.nicho, f.rede, f.seguidoresMin, f.comHistorico, f.avaliado, f.notaMin].filter(Boolean)
    .length;
}

export function totalSeguidores(redes: BankInflu["redes"]): number {
  return redes.reduce((sum, r) => sum + (Number(r.seguidores?.replace(/\D/g, "")) || 0), 0);
}

export type InfluencerBancoEnrichment = {
  historicoCount: number;
  mediaAvaliacao: number | null;
  avaliacoesCount: number;
  /** Participações já prontas pra avaliação (`participacaoProntaParaAvaliacao`)
   * que ainda não têm avaliação registrada — diferente de "ainda não
   * avaliado" (que cobre também quem nunca teve participação concluída
   * nenhuma). Nunca soma com `avaliacoesCount`: um influenciador pode ter
   * avaliações existentes E pendências ao mesmo tempo (campanhas
   * diferentes). */
  pendentesCount: number;
};

/** Quantas participações de uma lista já estão prontas pra avaliação
 * (entregas completas) mas ainda não foram avaliadas — `avaliadasIds` é
 * o conjunto de `campanhaInfluenciadorId` que já têm avaliação. */
export function countAvaliacoesPendentes(
  participacoes: Pick<ParticipacaoCampanha, "influ" | "campanhaInfluenciadorId">[],
  avaliadasIds: ReadonlySet<string>,
): number {
  return participacoes.filter(
    (p) => participacaoProntaParaAvaliacao(p) && !avaliadasIds.has(p.campanhaInfluenciadorId),
  ).length;
}

/** Filtra + ordena — `enrichmentById` traz histórico/avaliação já
 * calculados em lote (nunca recalculado por item dentro do filtro). */
export function filterBankInflus(
  list: BankInflu[],
  query: string,
  filters: InfluencerBancoFiltersState,
  enrichmentById: Map<string, InfluencerBancoEnrichment>,
): BankInflu[] {
  const q = query.trim().toLowerCase();
  const seguidoresMin = filters.seguidoresMin ? Number(filters.seguidoresMin) : 0;
  const notaMin = filters.notaMin ? Number(filters.notaMin) : 0;

  let out = list.filter((i) => {
    if (i.arquivado) return false;
    const enrich = enrichmentById.get(i.id);
    if (filters.nicho && i.nicho !== filters.nicho) return false;
    if (filters.rede && !i.redes.some((r) => r.plataforma === filters.rede)) return false;
    if (seguidoresMin && totalSeguidores(i.redes) < seguidoresMin) return false;
    const historico = enrich?.historicoCount ?? 0;
    if (filters.comHistorico === "com" && historico === 0) return false;
    if (filters.comHistorico === "sem" && historico > 0) return false;
    const avaliado = (enrich?.avaliacoesCount ?? 0) > 0;
    if (filters.avaliado === "avaliado" && !avaliado) return false;
    if (filters.avaliado === "nao_avaliado" && avaliado) return false;
    if (notaMin && (enrich?.mediaAvaliacao ?? 0) < notaMin) return false;
    if (!q) return true;
    return (
      i.nome.toLowerCase().includes(q) ||
      i.redes.some((r) => r.handle.toLowerCase().includes(q)) ||
      (i.telefone ?? "").includes(q) ||
      (i.email ?? "").toLowerCase().includes(q)
    );
  });

  out = [...out].sort((a, b) => {
    const ea = enrichmentById.get(a.id);
    const eb = enrichmentById.get(b.id);
    switch (filters.sort) {
      case "nome":
        return a.nome.localeCompare(b.nome, "pt-BR");
      case "seguidores":
        return totalSeguidores(b.redes) - totalSeguidores(a.redes);
      case "campanhas":
        return (eb?.historicoCount ?? 0) - (ea?.historicoCount ?? 0);
      case "avaliacao":
        return (eb?.mediaAvaliacao ?? 0) - (ea?.mediaAvaliacao ?? 0);
      case "recentes":
      default:
        return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    }
  });
  return out;
}
