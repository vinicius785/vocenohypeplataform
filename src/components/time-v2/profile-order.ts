/** Ordem das seções do perfil contínuo. "Ordenar" só REORGANIZA as mesmas
 * seções (nada some): ou prioriza uma seção específica, ou sobe primeiro as
 * que têm algo pedindo atenção. Ordem padrão = leitura de ficha
 * operacional: desempenho → tarefas → jornada → comunicação →
 * dependências → histórico → insights. */
export type SectionId =
  | "desempenho"
  | "atividade"
  | "jornada"
  | "comunicacao"
  | "dependencias"
  | "historico"
  | "insights";

export type ProfileSort = "padrao" | "atencao" | SectionId;

export const DEFAULT_SECTION_ORDER: SectionId[] = [
  "desempenho",
  "atividade",
  "jornada",
  "comunicacao",
  "dependencias",
  "historico",
  "insights",
];

export const SECTION_LABEL: Record<SectionId, string> = {
  desempenho: "Desempenho",
  atividade: "Tarefas",
  jornada: "Jornada",
  comunicacao: "Comunicação",
  dependencias: "Dependências",
  historico: "Histórico",
  insights: "Insights",
};

export const SORT_LABEL: Record<ProfileSort, string> = {
  padrao: "Ordem padrão",
  atencao: "Maior atenção primeiro",
  desempenho: "Desempenho primeiro",
  atividade: "Tarefas primeiro",
  jornada: "Jornada primeiro",
  comunicacao: "Comunicação primeiro",
  dependencias: "Dependências primeiro",
  historico: "Histórico primeiro",
  insights: "Insights primeiro",
};

export type AttentionFlags = Partial<Record<SectionId, boolean>>;

/** Seções com atenção primeiro (mantendo a ordem padrão entre elas e entre
 * as demais); uma seção escolhida vai pro topo; "padrao" não muda nada. */
export function orderSections(sort: ProfileSort, attention: AttentionFlags): SectionId[] {
  const base = [...DEFAULT_SECTION_ORDER];
  if (sort === "padrao") return base;
  if (sort === "atencao") {
    return [...base.filter((s) => attention[s]), ...base.filter((s) => !attention[s])];
  }
  return [sort, ...base.filter((s) => s !== sort)];
}
