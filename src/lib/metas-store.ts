import { createTableArrayStore } from "./table-array-store";

/**
 * Objetivos + Indicadores — substitui o modelo antigo de "uma meta com um
 * número só" (`tipo: "numerica"|"binaria"`, um `responsavel`, um `prazo`).
 * As duas variantes vivem na MESMA tabela `metas` (uma linha por item,
 * mesma RLS/realtime de sempre — sem migration de schema, só muda o
 * formato do `data` JSONB), diferenciadas por `kind`. Um Indicador é
 * "universal": aponta pra zero ou mais Objetivos com `objetivoIds?`
 * (mesmo espírito de referência solta já usado em `financeiro-entries.ts`:
 * `clienteId?`/`campanhaId?`, só que em lista) — array vazio/ausente = ele
 * é um indicador independente (é exatamente o que toda meta antiga vira
 * ao ser migrada, ver `normalizeMetaItem`).
 *
 * Toda a lógica de cálculo (performance/saúde/peso/progresso do objetivo)
 * fica em `metas-engine.ts` — este arquivo só cuida de tipos e persistência.
 */

export const META_AREAS = [
  "Marketing",
  "Operação",
  "Influenciadores",
  "Comercial",
  "Financeiro",
  "Produto",
  "Creator Management",
] as const;
export type MetaArea = (typeof META_AREAS)[number];

export const TRACKING_FREQUENCIES = [
  "continuo",
  "semanal",
  "quinzenal",
  "mensal",
  "trimestral",
  "personalizado",
] as const;
export type TrackingFrequency = (typeof TRACKING_FREQUENCIES)[number];

export const METRIC_TYPES = [
  "numero",
  "percentual",
  "moeda",
  "min",
  "max",
  "binario",
  "marco",
  "manual",
] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const METRIC_DIRECTIONS = [
  "aumentar",
  "reduzir",
  "manter_abaixo",
  "manter_acima",
  "concluir",
] as const;
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

export const INDICADOR_MARCO_STATUSES = ["nao_iniciado", "em_andamento", "concluido"] as const;
export type IndicadorMarcoStatus = (typeof INDICADOR_MARCO_STATUSES)[number];

export const COMPARISON_OPERATORS = [">=", "<=", "=", ">", "<"] as const;
export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];

/** Meta/operador de UM vínculo indicador↔objetivo — mesmo espírito de
 * `pesos` (indexado por `objetivoId`, na `Indicador`), só que pra
 * "quanto esse indicador precisa alcançar NESTE objetivo" em vez de
 * "quanto peso ele tem". Puramente aditivo: um indicador sem `alvos[id]`
 * pra um objetivo cai no fallback de `niveis.esperado`/`direcao` — ver
 * `metaEfetiva`/`comparadorEfetivo` em `metas-engine.ts`. */
export type VinculoAlvo = {
  meta?: number;
  comparador?: ComparisonOperator;
};

/** Todos opcionais — uma meta simples continua podendo usar só `esperado`
 * (o "alvo" de sempre). */
export type MetaNiveis = {
  baseline?: number;
  minimo?: number;
  esperado?: number;
  excelencia?: number;
};

/** Solto de propósito (sem FK/junction table) — mesmo padrão já usado em
 * `financeiro-entries.ts` (`clienteId?`/`campanhaId?`). Todos opcionais:
 * uma meta da empresa não precisa estar presa a nada. Sem UI de seleção
 * nesta rodada — só o campo pronto pro futuro. */
export type MetaVinculos = {
  projetoId?: string;
  clienteId?: string;
  campanhaId?: string;
};

export type MetaAtualizacao = {
  id: string;
  /** Valor no momento desta atualização — junto com o histórico dá pra ver
   * a evolução, não só o número final. */
  valor?: number;
  nota?: string;
  author: string;
  initials: string;
  color: string;
  createdAt: string;
};

type MetaBase = {
  id: string;
  titulo: string;
  descricao?: string;
  area: MetaArea;
  /** Nome do membro do time (mesma fonte de `loadTeamMembers`) — só UM
   * dono por Objetivo/Indicador. */
  dono?: string;
  /** Nomes dos membros que participam/acompanham, sem ser o principal
   * responsável. */
  colaboradores?: string[];
  dataInicio?: string; // YYYY-MM-DD
  dataFim?: string; // YYYY-MM-DD — prazo final, diferente de `frequencia`
  frequencia: TrackingFrequency;
  vinculos?: MetaVinculos;
  cancelado?: boolean;
  createdAt: string;
  updatedAt?: string;
};

/** Resultado maior, composto por vários indicadores (`Indicador.objetivoIds`
 * incluindo o id dele — um indicador pode apontar pra vários objetivos ao
 * mesmo tempo). O progresso do Objetivo é sempre DERIVADO
 * (`objetivoProgresso` em `metas-engine.ts`) a partir do desempenho de
 * cada indicador — nunca um número guardado à parte que possa dessincronizar. */
export type Objetivo = MetaBase & { kind: "objetivo" };

/** Métrica individual — "universal": pode pertencer a zero, um ou vários
 * Objetivos ao mesmo tempo (`objetivoIds`), contando pro progresso de
 * cada um com um peso próprio (`pesos`). Diferente de Objetivo, sempre
 * tem seus PRÓPRIOS dono/colaboradores/período/frequência (herdados de
 * `MetaBase`) — nunca apagados/herdados de um objetivo pai, já que agora
 * pode ter vários ao mesmo tempo (ou nenhum). */
export type Indicador = MetaBase & {
  kind: "indicador";
  objetivoIds?: string[];
  /** Peso (0-100) deste indicador dentro do cálculo de CADA objetivo,
   * indexado por `objetivoId` — o mesmo indicador pode pesar diferente em
   * objetivos diferentes. Ver `indicadorPeso` em `metas-engine.ts` pra
   * como pesos ausentes/inválidos são tratados (nunca corrompe o cálculo
   * do objetivo). */
  pesos?: Record<string, number>;
  /** Meta/operador por objetivo, indexado por `objetivoId` — mesmo
   * padrão de `pesos`. Objetivo sem entrada aqui usa o fallback global
   * (`niveis.esperado`/`direcao`), então todo indicador criado antes
   * deste campo existir continua se comportando exatamente como hoje. */
  alvos?: Record<string, VinculoAlvo>;
  tipo: MetricType;
  /** `tipo: "min"`/`"max"` pré-selecionam isso no formulário
   * (`manter_acima`/`manter_abaixo`), mas o motor de cálculo sempre olha
   * só pra `direcao` — um único caminho de código pras variantes
   * numéricas, nunca duas lógicas paralelas por tipo. */
  direcao: MetricDirection;
  /** "auto" é reservado pro futuro — sem fonte automática de verdade
   * implementada ainda, a UI mostra a opção desabilitada. */
  dataSource: "manual" | "auto";
  unidade?: string;
  niveis: MetaNiveis;
  valorAtual?: number; // numero/percentual/moeda/min/max/manual
  concluido?: boolean; // binario
  marcoStatus?: IndicadorMarcoStatus; // marco
  /** Cálculo automático do valor a partir de uma razão (só faz sentido
   * pra `tipo: "percentual"`) — ex. "2 de 10 projetos no prazo" = 20%.
   * Quando os dois estão setados, `valorAtual` é sempre o percentual
   * derivado (`calcContagem / calcTotal * 100`), mantido em sync no
   * momento de salvar — nunca calculado de novo em outro lugar do código
   * (única fonte: o formulário de atualização). Ausentes = valor digitado
   * direto, comportamento de sempre. */
  calcTotal?: number;
  calcContagem?: number;
  atualizacoes?: MetaAtualizacao[];
};

export type MetaItem = Objetivo | Indicador;

/** Formato antigo (pré-Objetivos/Indicadores) — só usado dentro de
 * `normalizeMetaItem` pra reconhecer e migrar uma linha legada. */
type LegacyMeta = {
  id: string;
  titulo: string;
  descricao?: string;
  area: string;
  tipo: "numerica" | "binaria";
  valorAlvo?: number;
  valorAtual?: number;
  unidade?: string;
  concluida?: boolean;
  responsavel?: string;
  prazo?: string;
  cancelada?: boolean;
  createdAt: string;
  updatedAt?: string;
  atualizacoes?: MetaAtualizacao[];
};

function isLegacyMeta(raw: unknown): raw is LegacyMeta {
  return !!raw && typeof raw === "object" && !("kind" in raw);
}

/** Migra uma linha antiga (`tipo: "numerica"|"binaria"`, sem `kind`) pro
 * novo formato — sempre vira um Indicador SEM `objetivoId` (é exatamente
 * a regra pedida: "meta antiga sem Objetivo pai continua existindo como
 * Indicador independente"). Não-destrutivo: só grava de novo no banco se
 * o item for editado e salvo depois — até lá, a linha antiga continua no
 * banco do jeito que estava, só é traduzida na leitura. Um backfill à
 * parte (rodado uma vez contra o Supabase de produção) já reescreve as
 * linhas existentes de verdade, mas esta função continua como rede de
 * segurança pra qualquer linha que escape do backfill. */
function migrateLegacyMeta(m: LegacyMeta): Indicador {
  return {
    kind: "indicador",
    id: m.id,
    titulo: m.titulo,
    descricao: m.descricao,
    area: (META_AREAS as readonly string[]).includes(m.area) ? (m.area as MetaArea) : "Operação",
    dono: m.responsavel,
    colaboradores: undefined,
    dataInicio: undefined,
    dataFim: m.prazo,
    frequencia: "continuo",
    vinculos: undefined,
    cancelado: m.cancelada,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    objetivoIds: undefined,
    pesos: undefined,
    tipo: m.tipo === "binaria" ? "binario" : "numero",
    // Único sentido que o modelo antigo já implicava: valorAtual crescendo
    // até bater valorAlvo.
    direcao: "aumentar",
    dataSource: "manual",
    unidade: m.unidade,
    niveis: { esperado: m.valorAlvo },
    valorAtual: m.valorAtual,
    concluido: m.concluida,
    marcoStatus: undefined,
    atualizacoes: m.atualizacoes,
  };
}

/** Indicador salvo no formato anterior a "indicador universal" tinha um
 * único `objetivoId?: string` + `peso?: number`, em vez de
 * `objetivoIds?: string[]` + `pesos?: Record<string, number>`. Traduz
 * não-destrutivamente (só regrava no formato novo se o indicador for
 * salvo de novo depois) — mesmo espírito de `migrateLegacyMeta`. */
function normalizeIndicadorLinks(ind: Indicador): Indicador {
  const legacy = ind as Indicador & { objetivoId?: string; peso?: number };
  if (legacy.objetivoIds !== undefined || legacy.objetivoId == null) return ind;
  return {
    ...ind,
    objetivoIds: [legacy.objetivoId],
    pesos: legacy.peso != null ? { [legacy.objetivoId]: legacy.peso } : undefined,
  };
}

/** Única porta de entrada pra normalizar uma linha da tabela `metas` —
 * chamada por `loadMetas()`. Formato novo passa direto; formato antigo de
 * meta legada é migrado via `migrateLegacyMeta`; indicador no formato
 * anterior de vínculo único (`objetivoId`/`peso`) é traduzido via
 * `normalizeIndicadorLinks`. */
export function normalizeMetaItem(raw: unknown): MetaItem {
  if (isLegacyMeta(raw)) return migrateLegacyMeta(raw);
  const item = raw as MetaItem;
  return item.kind === "indicador" ? normalizeIndicadorLinks(item) : item;
}

const store = createTableArrayStore<MetaItem>("metas");

export function initMetasSync(): Promise<void> {
  const p = store.init();
  store.subscribeRealtime();
  return p;
}

export function loadMetas(): MetaItem[] {
  return store.get().map(normalizeMetaItem);
}

export function saveMetas(list: MetaItem[]) {
  store.set(() => list);
}

export function onMetasChange(callback: () => void): () => void {
  return store.subscribe(callback);
}

export function loadObjetivos(): Objetivo[] {
  return loadMetas().filter((m): m is Objetivo => m.kind === "objetivo");
}

export function loadIndicadores(): Indicador[] {
  return loadMetas().filter((m): m is Indicador => m.kind === "indicador");
}
