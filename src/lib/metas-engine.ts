import type {
  ComparisonOperator,
  Indicador,
  MetaAtualizacao,
  MetricDirection,
  Objetivo,
  TrackingFrequency,
} from "./metas-store";

/**
 * Motor de cálculo de Metas — única fonte de verdade pra performance,
 * saúde e progresso ponderado. Tudo puro (sem estado, sem I/O), usado
 * tanto pelos cards quanto pelos tiles de resumo, nunca duplicado entre
 * telas. Mesmo espírito de `entrega-engine.ts`: a UI nunca calcula saúde/
 * progresso na mão, sempre chama essas funções.
 */

export type IndicadorSaude =
  | "saudavel"
  | "atencao"
  | "em_risco"
  | "atrasado"
  | "concluido"
  | "nao_iniciado"
  | "cancelado";

export const INDICADOR_SAUDE_LABEL: Record<IndicadorSaude, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  em_risco: "Em risco",
  atrasado: "Atrasado",
  concluido: "Concluído",
  nao_iniciado: "Não iniciado",
  cancelado: "Cancelado",
};

export const INDICADOR_SAUDE_TONE: Record<IndicadorSaude, string> = {
  saudavel: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  atencao: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  em_risco: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  atrasado: "bg-red-500/10 text-red-700 dark:text-red-400",
  concluido: "bg-foreground text-background",
  nao_iniciado: "bg-muted text-muted-foreground",
  cancelado: "bg-muted/60 text-muted-foreground line-through",
};

export const INDICADOR_SAUDE_DOT: Record<IndicadorSaude, string> = {
  saudavel: "bg-emerald-500",
  atencao: "bg-amber-500",
  em_risco: "bg-rose-500",
  atrasado: "bg-red-500",
  concluido: "bg-foreground",
  nao_iniciado: "bg-muted-foreground/40",
  cancelado: "bg-muted-foreground/30",
};

/** Barra de progresso colorida pela mesma saúde do badge — usado nos
 * cards em vez do `bg-foreground` fixo de sempre. */
export const INDICADOR_SAUDE_BAR: Record<IndicadorSaude, string> = {
  saudavel: "bg-emerald-500",
  atencao: "bg-amber-500",
  em_risco: "bg-rose-500",
  atrasado: "bg-red-500",
  concluido: "bg-foreground",
  nao_iniciado: "bg-muted-foreground/30",
  cancelado: "bg-muted-foreground/20",
};

export const COMPARISON_OPERATOR_LABEL: Record<ComparisonOperator, string> = {
  ">=": "Maior ou igual a",
  "<=": "Menor ou igual a",
  "=": "Igual a",
  ">": "Maior que",
  "<": "Menor que",
};

export const COMPARISON_OPERATOR_SYMBOL: Record<ComparisonOperator, string> = {
  ">=": "≥",
  "<=": "≤",
  "=": "=",
  ">": ">",
  "<": "<",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isPastDate(dateISO?: string): boolean {
  return !!dateISO && dateISO < todayISO();
}

function higherIsBetter(direcao: MetricDirection): boolean {
  return direcao !== "reduzir" && direcao !== "manter_abaixo";
}

/** Operador padrão quando um vínculo não escolheu um explicitamente —
 * derivado de `direcao`, o mesmo sentido que `higherIsBetter` já usa.
 * Nunca devolve "=" (só alcançável escolhendo explicitamente num
 * vínculo novo, nunca em dado existente). */
export function direcaoParaComparadorPadrao(direcao: MetricDirection): ComparisonOperator {
  return direcao === "reduzir" || direcao === "manter_abaixo" ? "<=" : ">=";
}

/** Operador de comparação em uso NESTE vínculo (indicador↔objetivo) —
 * `ind.alvos?.[objetivoId]?.comparador` quando definido, senão derivado
 * de `direcao` (mesmo valor que já era implícito antes deste campo
 * existir). */
export function comparadorEfetivo(
  ind: Pick<Indicador, "alvos" | "direcao">,
  objetivoId: string,
): ComparisonOperator {
  return ind.alvos?.[objetivoId]?.comparador ?? direcaoParaComparadorPadrao(ind.direcao);
}

/** Meta efetiva NESTE vínculo — `ind.alvos?.[objetivoId]?.meta` quando
 * definida, senão `niveis.esperado` (o valor global de sempre). */
export function metaEfetiva(
  ind: Pick<Indicador, "alvos" | "niveis">,
  objetivoId: string,
): number | undefined {
  return ind.alvos?.[objetivoId]?.meta ?? ind.niveis.esperado;
}

/** Baseline sintético quando nenhum é configurado — pra "aumentar"/
 * "manter_acima"/"concluir" o ponto de partida natural é zero; pra
 * "reduzir"/"manter_abaixo" (metas de teto, ex. "operações ≤ 6") zero
 * seria o MELHOR valor possível, não um ponto de partida — usa o dobro
 * do alvo como referência de "estado não otimizado". Configurar um
 * `baseline` de verdade sempre dá um resultado mais preciso; isto é só
 * o fallback quando ninguém configurou nada. */
function defaultBaseline(alvo: number, direcao: MetricDirection): number {
  if (higherIsBetter(direcao)) return 0;
  return alvo > 0 ? alvo * 2 : alvo - Math.max(1, Math.abs(alvo));
}

/** Razão direcional entre baseline e alvo, em pontos percentuais (pode
 * passar de 100 quando `atual` supera o alvo/excelência, pode ser
 * negativo quando está pior que o baseline — quem chama decide se
 * clampa). Único ponto do código que sabe interpretar `direcao` —
 * `tipo: "min"/"max"` nunca ganham lógica própria, só pré-selecionam a
 * direção certa no formulário. */
function directionalRatio(
  atual: number,
  alvo: number,
  baseline: number,
  direcao: MetricDirection,
): number {
  if (higherIsBetter(direcao)) {
    if (alvo === baseline) return atual >= alvo ? 100 : 0;
    return ((atual - baseline) / (alvo - baseline)) * 100;
  }
  if (baseline === alvo) return atual <= alvo ? 100 : 0;
  return ((baseline - atual) / (baseline - alvo)) * 100;
}

/** Performance 0-100 (sem teto: pode superar 100 ao passar da meta de
 * excelência) relativa ao nível `esperado` — `null` quando o indicador
 * ainda não tem dado suficiente pra calcular (sem `esperado` ou sem
 * `valorAtual` configurado ainda). */
export function indicadorPerformance(ind: Indicador): number | null {
  if (ind.tipo === "binario") return ind.concluido ? 100 : 0;
  if (ind.tipo === "marco") {
    if (ind.marcoStatus === "concluido") return 100;
    if (ind.marcoStatus === "em_andamento") return 50;
    return 0;
  }
  const alvo = ind.niveis.esperado;
  const atual = ind.valorAtual;
  if (alvo == null || atual == null) return null;
  const baseline = ind.niveis.baseline ?? defaultBaseline(alvo, ind.direcao);
  return Math.max(0, directionalRatio(atual, alvo, baseline, ind.direcao));
}

/** Saúde do indicador — deriva de `performance` + prazo + o nível
 * `minimo` que o PRÓPRIO indicador configurou (convertido pro mesmo
 * espaço de performance, nunca comparado como valor bruto). Sem
 * `minimo` configurado, usa um fallback documentado (80% do caminho até
 * o alvo) em vez de qualquer valor absoluto da métrica — a fronteira
 * "atenção vs risco" é sempre relativa ao que já foi configurado, nunca
 * hardcoded pra métrica nenhuma. */
export function indicadorSaude(ind: Indicador): IndicadorSaude {
  if (ind.cancelado) return "cancelado";
  const perf = indicadorPerformance(ind);
  if (perf === null) return "nao_iniciado";

  const isOneShot = ind.tipo === "binario" || ind.tipo === "marco";
  const overdue = isPastDate(ind.dataFim);

  if (perf >= 100) return isOneShot || overdue ? "concluido" : "saudavel";
  if (overdue) return "atrasado";

  if (ind.niveis.minimo != null && ind.niveis.esperado != null) {
    const baseline = ind.niveis.baseline ?? defaultBaseline(ind.niveis.esperado, ind.direcao);
    const perfMin = directionalRatio(ind.niveis.minimo, ind.niveis.esperado, baseline, ind.direcao);
    return perf > perfMin ? "atencao" : "em_risco";
  }
  return perf >= 80 ? "atencao" : "em_risco";
}

/** Performance NESTE vínculo (indicador↔objetivo) — mesmo indicador pode
 * estar em risco num objetivo e saudável em outro, porque cada um pode
 * ter sua própria meta/operador (`metaEfetiva`/`comparadorEfetivo`).
 * Binário/marco delegam pra `indicadorPerformance` (não fazem sentido
 * por vínculo — "concluído" é do indicador, não do objetivo). Sem
 * `alvos[objetivoId]`, o resultado é IDÊNTICO a `indicadorPerformance`
 * (mesma matemática, só resolvida via fallback — ver prova no plano). */
export function indicadorPerformanceParaObjetivo(
  ind: Indicador,
  objetivoId: string,
): number | null {
  if (ind.tipo === "binario" || ind.tipo === "marco") return indicadorPerformance(ind);
  const meta = metaEfetiva(ind, objetivoId);
  const atual = ind.valorAtual;
  if (meta == null || atual == null) return null;
  const comparador = comparadorEfetivo(ind, objetivoId);
  if (comparador === "=") {
    // "=" não tem baseline natural (não é "quanto maior/menor melhor") —
    // 100% só quando bate exato, cai proporcionalmente à distância
    // relativa até a meta.
    if (meta === 0) return atual === 0 ? 100 : 0;
    return Math.max(0, 100 - (Math.abs(atual - meta) / Math.abs(meta)) * 100);
  }
  const direcaoEquivalente: MetricDirection =
    comparador === ">=" || comparador === ">" ? "aumentar" : "reduzir";
  const baseline = ind.niveis.baseline ?? defaultBaseline(meta, direcaoEquivalente);
  return Math.max(0, directionalRatio(atual, meta, baseline, direcaoEquivalente));
}

/** Saúde NESTE vínculo — mesmo shape de `indicadorSaude`, usando a
 * performance/meta efetivas do vínculo em vez das globais. Sem
 * `alvos[objetivoId]`, o resultado é idêntico a `indicadorSaude`. */
export function indicadorSaudeParaObjetivo(ind: Indicador, objetivoId: string): IndicadorSaude {
  if (ind.cancelado) return "cancelado";
  const perf = indicadorPerformanceParaObjetivo(ind, objetivoId);
  if (perf === null) return "nao_iniciado";

  const isOneShot = ind.tipo === "binario" || ind.tipo === "marco";
  const overdue = isPastDate(ind.dataFim);

  if (perf >= 100) return isOneShot || overdue ? "concluido" : "saudavel";
  if (overdue) return "atrasado";

  const meta = metaEfetiva(ind, objetivoId);
  if (ind.niveis.minimo != null && meta != null) {
    const comparador = comparadorEfetivo(ind, objetivoId);
    const direcaoEquivalente: MetricDirection =
      comparador === "="
        ? ind.direcao
        : comparador === ">=" || comparador === ">"
          ? "aumentar"
          : "reduzir";
    const baseline = ind.niveis.baseline ?? defaultBaseline(meta, direcaoEquivalente);
    const perfMin = directionalRatio(ind.niveis.minimo, meta, baseline, direcaoEquivalente);
    return perf > perfMin ? "atencao" : "em_risco";
  }
  return perf >= 80 ? "atencao" : "em_risco";
}

/** Peso efetivo do indicador dentro do cálculo de UM objetivo específico
 * (0-100) — o mesmo indicador pode pesar diferente em objetivos
 * diferentes, por isso `objetivoId` é sempre explícito (nunca inferido de
 * um único campo no indicador). Regras: usa `ind.pesos[objetivoId]`
 * quando definido; indicadores sem peso dividem igualmente o que sobrar
 * de 100 depois de descontar quem tem peso explícito NESTE objetivo; se a
 * soma dos pesos explícitos passar de 100, normaliza proporcionalmente em
 * vez de deixar o cálculo do objetivo estourar — um peso mal configurado
 * nunca corrompe o resultado, só fica proporcionalmente menor que o
 * número digitado. `siblings` já deve vir filtrado pros indicadores DESTE
 * objetivo (quem chama decide o grupo, ex. `objetivoProgresso`). */
export function indicadorPeso(ind: Indicador, siblings: Indicador[], objetivoId: string): number {
  const group = siblings.filter((s) => !s.cancelado);
  const pesoDe = (s: Indicador) => s.pesos?.[objetivoId];
  const withWeight = group.filter((s) => pesoDe(s) != null);
  const withoutWeight = group.filter((s) => pesoDe(s) == null);
  const explicitSum = withWeight.reduce((s, x) => s + (pesoDe(x) ?? 0), 0);

  const indPeso = pesoDe(ind);
  if (indPeso != null) {
    if (explicitSum <= 100 || explicitSum === 0) return indPeso;
    return (indPeso / explicitSum) * 100; // normaliza pra nunca passar de 100 somado
  }
  const remaining = Math.max(0, 100 - Math.min(100, explicitSum));
  return withoutWeight.length > 0 ? remaining / withoutWeight.length : 0;
}

/** Progresso consolidado do objetivo (0-100) — média ponderada da
 * performance de cada indicador (nunca uma média burra de valores em
 * unidades diferentes: cada indicador já foi convertido pra uma
 * performance % antes de entrar na conta). Indicadores sem performance
 * calculável (ainda não configurados) são excluídos do cálculo, não
 * contam como 0. `null` quando não há nenhum indicador calculável. */
export function objetivoProgresso(objetivoId: string, indicadores: Indicador[]): number | null {
  const group = indicadores.filter((i) => i.objetivoIds?.includes(objetivoId) && !i.cancelado);
  const scored = group
    .map((i) => ({
      perf: indicadorPerformanceParaObjetivo(i, objetivoId),
      peso: indicadorPeso(i, group, objetivoId),
    }))
    .filter((x): x is { perf: number; peso: number } => x.perf !== null);
  if (scored.length === 0) return null;
  const totalPeso = scored.reduce((s, x) => s + x.peso, 0);
  if (totalPeso <= 0) return null;
  const weighted = scored.reduce((s, x) => s + x.perf * x.peso, 0) / totalPeso;
  return Math.max(0, Math.min(100, weighted));
}

export type ObjetivoStats = {
  total: number;
  saudaveis: number;
  atencao: number;
  emRisco: number;
  concluidos: number;
  atrasados: number;
  naoIniciados: number;
};

export function objetivoStats(objetivoId: string, indicadores: Indicador[]): ObjetivoStats {
  const group = indicadores.filter((i) => i.objetivoIds?.includes(objetivoId));
  const stats: ObjetivoStats = {
    total: group.length,
    saudaveis: 0,
    atencao: 0,
    emRisco: 0,
    concluidos: 0,
    atrasados: 0,
    naoIniciados: 0,
  };
  for (const i of group) {
    switch (indicadorSaudeParaObjetivo(i, objetivoId)) {
      case "saudavel":
        stats.saudaveis++;
        break;
      case "atencao":
        stats.atencao++;
        break;
      case "em_risco":
        stats.emRisco++;
        break;
      case "concluido":
        stats.concluidos++;
        break;
      case "atrasado":
        stats.atrasados++;
        break;
      case "nao_iniciado":
        stats.naoIniciados++;
        break;
      case "cancelado":
        break;
    }
  }
  return stats;
}

/** Saúde resumida de um Objetivo, derivada da saúde dos seus indicadores
 * (cascata: cancelado → em risco → atenção → concluído → não iniciado →
 * saudável) — igual ao que já vinha sendo calculado, duplicado, dentro de
 * `ObjetivoSummaryCard.tsx` e `ObjetivoPage.tsx`; centralizado aqui pra
 * essas duas telas (e o resumo do topo da lista) nunca divergirem. */
export function objetivoResumoSaude(
  objetivo: Pick<Objetivo, "cancelado">,
  stats: ObjetivoStats,
): IndicadorSaude {
  if (objetivo.cancelado) return "cancelado";
  if (stats.emRisco > 0 || stats.atrasados > 0) return "em_risco";
  if (stats.atencao > 0) return "atencao";
  if (stats.total > 0 && stats.concluidos === stats.total) return "concluido";
  if (stats.total === 0) return "nao_iniciado";
  return "saudavel";
}

/** % do período do objetivo já decorrido até hoje — informação
 * COMPLEMENTAR ao progresso real, nunca usada pra calcular saúde. `null`
 * quando não há `dataInicio`/`dataFim` suficientes pra calcular (nunca
 * inventa um valor) ou quando o período é invertido/zero. */
export function progressoEsperado(
  objetivo: Pick<Objetivo, "dataInicio" | "dataFim">,
): number | null {
  if (!objetivo.dataInicio || !objetivo.dataFim) return null;
  const start = new Date(`${objetivo.dataInicio}T00:00:00`).getTime();
  const end = new Date(`${objetivo.dataFim}T00:00:00`).getTime();
  if (!(end > start)) return null;
  const pct = ((Date.now() - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/** Diferença entre o valor atual do indicador e sua meta esperada, na
 * unidade original do indicador (não a performance 0-100) — junto com
 * `favoravel` (se essa diferença é boa ou ruim, considerando `direcao`:
 * indicador "quanto menor melhor" fica favorável estando ABAIXO da meta,
 * não acima). `null` sem meta/valor configurados. */
export function metaGap(
  ind: Pick<Indicador, "niveis" | "valorAtual" | "direcao">,
): { diff: number; favoravel: boolean } | null {
  const meta = ind.niveis.esperado;
  const atual = ind.valorAtual;
  if (meta == null || atual == null) return null;
  const diff = atual - meta;
  const favoravel = higherIsBetter(ind.direcao) ? diff >= 0 : diff <= 0;
  return { diff, favoravel };
}

/** Mesmo que `metaGap`, mas contra a meta/operador EFETIVOS de um
 * vínculo específico em vez dos globais do indicador. */
export function metaGapParaObjetivo(
  ind: Pick<Indicador, "niveis" | "valorAtual" | "direcao" | "alvos">,
  objetivoId: string,
): { diff: number; favoravel: boolean } | null {
  const meta = metaEfetiva(ind, objetivoId);
  const atual = ind.valorAtual;
  if (meta == null || atual == null) return null;
  const comparador = comparadorEfetivo(ind, objetivoId);
  const diff = atual - meta;
  const favoravel =
    comparador === "="
      ? diff === 0
      : comparador === ">=" || comparador === ">"
        ? diff >= 0
        : diff <= 0;
  return { diff, favoravel };
}

export type IndicadorTendencia = { trend: "melhorando" | "piorando" | "estavel"; diff: number };

/** Tendência entre as duas últimas atualizações com `valor` definido —
 * `null` com menos de 2 (nunca assume tendência sem histórico de
 * verdade). Direção-consciente via `direcao`: pra indicador "quanto menor
 * melhor", um valor menor que o anterior é "melhorando", não "piorando". */
export function indicadorTendencia(
  ind: Pick<Indicador, "atualizacoes" | "direcao">,
): IndicadorTendencia | null {
  const valores = (ind.atualizacoes ?? []).filter(
    (a): a is MetaAtualizacao & { valor: number } => a.valor != null,
  );
  if (valores.length < 2) return null;
  const atual = valores[valores.length - 1].valor;
  const anterior = valores[valores.length - 2].valor;
  const diff = atual - anterior;
  if (diff === 0) return { trend: "estavel", diff };
  const melhorando = higherIsBetter(ind.direcao) ? diff > 0 : diff < 0;
  return { trend: melhorando ? "melhorando" : "piorando", diff };
}

export type StatusAtualizacao = "atualizado" | "precisa_atualizar" | "muito_desatualizado";

/** Dias esperados entre atualizações, por cadência — só as que têm
 * cadência de verdade ("continuo"/"personalizado" ficam de fora: sem
 * expectativa de ritmo, nunca "atrasam"). "Muito desatrasado" = 2x o
 * prazo normal. Isso é conceito DIFERENTE de `indicadorSaude` (seção 43
 * do pedido: "não misturar os dois") — nunca entra no cálculo de
 * progresso/saúde, só informa a rotina de manutenção da aba
 * Indicadores. */
const CADENCE_STALE_DAYS: Partial<Record<TrackingFrequency, number>> = {
  semanal: 7,
  quinzenal: 14,
  mensal: 30,
  trimestral: 90,
};

/** Status de atualização do indicador — puramente sobre "o dado está
 * velho pra cadência dele", nunca sobre se o valor atende a meta de
 * algum objetivo (isso é `indicadorSaudeParaObjetivo`). Sem cadência
 * definida (`continuo`/`personalizado`) ou sem nenhuma atualização
 * ainda, sempre `"atualizado"` — não dá pra cobrar ritmo de quem não
 * tem ritmo esperado. */
export function indicadorStatusAtualizacao(
  ind: Pick<Indicador, "frequencia" | "updatedAt" | "createdAt">,
): StatusAtualizacao {
  const staleDays = CADENCE_STALE_DAYS[ind.frequencia];
  if (staleDays == null) return "atualizado";
  const dias = Math.floor(
    (Date.now() - new Date(ind.updatedAt ?? ind.createdAt).getTime()) / 86_400_000,
  );
  if (dias > staleDays * 2) return "muito_desatualizado";
  if (dias > staleDays) return "precisa_atualizar";
  return "atualizado";
}

/** Prioridade de manutenção pra ordenar a aba Indicadores por padrão —
 * combina "dado velho" + "quantos objetivos dependem dele" + "quantos
 * desses estão em risco", maior = mais urgente de olhar primeiro. Só
 * ordenação, não é saúde nem status de atualização — não persiste em
 * lugar nenhum. */
export function indicadorPrioridade(
  status: StatusAtualizacao,
  objetivosCount: number,
  emRiscoCount: number,
): number {
  const base = status === "muito_desatualizado" ? 100 : status === "precisa_atualizar" ? 50 : 0;
  return base + emRiscoCount * 10 + objetivosCount;
}

/** Progresso 0-100 pra exibição num card — indicador standalone usa a
 * própria performance; dentro de um objetivo, ainda mostra a performance
 * individual dele (o progresso PONDERADO só existe no nível do
 * objetivo). `null` vira 0 só na hora de desenhar a barra, nunca antes. */
export function indicadorProgressoExibicao(ind: Indicador): number {
  return Math.max(0, Math.min(100, indicadorPerformance(ind) ?? 0));
}
