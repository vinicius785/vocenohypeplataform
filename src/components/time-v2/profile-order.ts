/** Ordem das seções do perfil contínuo. "Ordenar" só REORGANIZA as mesmas
 * seções (nada some): ou prioriza uma seção específica, ou sobe primeiro as
 * que têm algo pedindo atenção. */
export type SectionId = "atividade" | "jornada" | "desempenho" | "comunicacao" | "historico";

export type ProfileSort = "padrao" | "atencao" | SectionId;

export const DEFAULT_SECTION_ORDER: SectionId[] = [
  "atividade",
  "jornada",
  "desempenho",
  "comunicacao",
  "historico",
];

export const SECTION_LABEL: Record<SectionId, string> = {
  atividade: "Tarefas",
  jornada: "Jornada",
  desempenho: "Desempenho",
  comunicacao: "Comunicação",
  historico: "Histórico",
};

export const SORT_LABEL: Record<ProfileSort, string> = {
  padrao: "Ordem padrão",
  atencao: "Maior atenção",
  atividade: "Tarefas",
  jornada: "Jornada",
  desempenho: "Desempenho",
  comunicacao: "Comunicação",
  historico: "Mais recente",
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
