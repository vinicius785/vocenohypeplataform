import type { Indicador, MetricDirection } from "./metas-store";

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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isPastDate(dateISO?: string): boolean {
  return !!dateISO && dateISO < todayISO();
}

function higherIsBetter(direcao: MetricDirection): boolean {
  return direcao !== "reduzir" && direcao !== "manter_abaixo";
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

/** Peso efetivo do indicador dentro do cálculo do objetivo (0-100).
 * Regras: usa `ind.peso` quando definido; indicadores sem peso dividem
 * igualmente o que sobrar de 100 depois de descontar quem tem peso
 * explícito; se a soma dos pesos explícitos passar de 100, normaliza
 * proporcionalmente em vez de deixar o cálculo do objetivo estourar —
 * um peso mal configurado nunca corrompe o resultado, só fica
 * proporcionalmente menor que o número digitado. */
export function indicadorPeso(ind: Indicador, siblings: Indicador[]): number {
  const group = siblings.filter((s) => s.objetivoId === ind.objetivoId && !s.cancelado);
  const withWeight = group.filter((s) => s.peso != null);
  const withoutWeight = group.filter((s) => s.peso == null);
  const explicitSum = withWeight.reduce((s, x) => s + (x.peso ?? 0), 0);

  if (ind.peso != null) {
    if (explicitSum <= 100 || explicitSum === 0) return ind.peso;
    return (ind.peso / explicitSum) * 100; // normaliza pra nunca passar de 100 somado
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
  const group = indicadores.filter((i) => i.objetivoId === objetivoId && !i.cancelado);
  const scored = group
    .map((i) => ({ perf: indicadorPerformance(i), peso: indicadorPeso(i, group) }))
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
  const group = indicadores.filter((i) => i.objetivoId === objetivoId);
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
    switch (indicadorSaude(i)) {
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

/** Progresso 0-100 pra exibição num card — indicador standalone usa a
 * própria performance; dentro de um objetivo, ainda mostra a performance
 * individual dele (o progresso PONDERADO só existe no nível do
 * objetivo). `null` vira 0 só na hora de desenhar a barra, nunca antes. */
export function indicadorProgressoExibicao(ind: Indicador): number {
  return Math.max(0, Math.min(100, indicadorPerformance(ind) ?? 0));
}
