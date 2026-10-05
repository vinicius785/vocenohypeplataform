/**
 * Fonte única dos tipos e labels de navegação por seção (Etapa 3) —
 * antes cada sub-tab (Financeiro/Time/Metas/Reuniões) tinha seu próprio
 * tipo local espalhado; centralizado aqui pra sidebar, `time.tsx` e cada
 * `*Section.tsx` compartilharem os mesmos valores sem duplicar.
 *
 * `SectionKey` foi movido de `AppShell.tsx` pra aqui (só `time.tsx`
 * importava o tipo diretamente; os outros lugares que navegam por
 * `?section=` usam a string literal, então mover é seguro).
 */
export type SectionKey =
  | "inicio"
  | "clientes"
  | "campanhas"
  | "projetos"
  | "reunioes"
  | "comercial"
  | "financeiro"
  | "time"
  | "influenciadores"
  | "metas"
  | "chat"
  | "configuracoes"
  | "problemas";

/** Financeiro tem 3 áreas: Resumo (entender a situação), Lançamentos (operar)
 * e Análises (entender os resultados). "A receber"/"A pagar"/"Entradas"/
 * "Saídas" são segmentações DENTRO de Lançamentos, e "Por campanha" é uma
 * visão DENTRO de Análises — nunca áreas estruturais. */
export type FinanceiroTab = "resumo" | "lancamentos" | "analises";

export const FINANCEIRO_TABS: { key: FinanceiroTab; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "lancamentos", label: "Lançamentos" },
  { key: "analises", label: "Análises" },
];

/** Tipo da lista de Lançamentos — um filtro de primeiro nível (entradas =
 * receitas, saídas = despesas). "A receber"/"A pagar"/"Vencido" são STATUS,
 * dentro de Filtros — não segmentos. */
export type LancamentosSegment = "todos" | "entradas" | "saidas";
export const LANCAMENTOS_SEGMENTS: { key: LancamentosSegment; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "entradas", label: "Entradas" },
  { key: "saidas", label: "Saídas" },
];

export type AnalisesView = "geral" | "campanhas";
export const ANALISES_VIEWS: { key: AnalisesView; label: string }[] = [
  { key: "geral", label: "Geral" },
  { key: "campanhas", label: "Por campanha" },
];

/** Valores antigos de `?financeiroTab=` (links salvos/compartilhados antes
 * da consolidação em 3 áreas) → a área nova + a segmentação/visão
 * equivalente. Nunca quebra um link antigo. */
/** Valores antigos de `?financeiroTab=` (antes das 3 áreas) → área nova. Os
 * antigos "a-receber"/"a-pagar" viram Lançamentos já com o recorte "em aberto"
 * daquele tipo (`preset`), sobre todo o período. */
const LEGACY_FINANCEIRO_TAB: Record<
  string,
  {
    tab: FinanceiroTab;
    segment?: LancamentosSegment;
    view?: AnalisesView;
    preset?: "a-receber" | "a-pagar";
  }
> = {
  movimentacoes: { tab: "lancamentos", segment: "todos" },
  "a-receber": { tab: "lancamentos", segment: "entradas", preset: "a-receber" },
  "a-pagar": { tab: "lancamentos", segment: "saidas", preset: "a-pagar" },
  campanhas: { tab: "analises", view: "campanhas" },
  relatorios: { tab: "analises", view: "geral" },
};

export type FinanceiroLegacyPreset = "a-receber" | "a-pagar";

export type MetasTab = "objetivos" | "indicadores";

export const METAS_TABS: { key: MetasTab; label: string }[] = [
  { key: "objetivos", label: "Objetivos" },
  { key: "indicadores", label: "Indicadores" },
];

/** `"disponibilidade"` foi removido desta união (Etapa 3) — a
 * Disponibilidade migrou pra Configurações. Um valor antigo na URL cai
 * no fallback `"agenda"` (ver `resolveReunioesView`).
 *
 * Fase 3 da reconstrução de Reuniões: voltou a ser um `SegmentedControl` +
 * botão dentro da própria página (não mais subitens de sidebar — ver
 * `SECTION_SUBNAV` abaixo), então os valores viraram em inglês pra bater
 * com o padrão de URL pedido (`?view=agenda|calendar|requests`). Um link
 * antigo com `reunioesView=calendario`/`solicitacoes` (valor em português)
 * é mapeado pelo `resolveReunioesView`, não aqui. */
export type ReunioesView = "agenda" | "calendar" | "requests";

export function resolveFinanceiroTab(value: string | undefined): FinanceiroTab {
  if (value && LEGACY_FINANCEIRO_TAB[value]) return LEGACY_FINANCEIRO_TAB[value].tab;
  return FINANCEIRO_TABS.some((t) => t.key === value) ? (value as FinanceiroTab) : "resumo";
}

/** Segmentação/visão inicial implícita num valor antigo da URL (ver acima). */
/** Segmentação/visão/recorte inicial implícitos num valor antigo da URL. */
export function resolveFinanceiroLegacyTarget(value: string | undefined): {
  segment: LancamentosSegment;
  view: AnalisesView;
  preset?: FinanceiroLegacyPreset;
} {
  const legacy = value ? LEGACY_FINANCEIRO_TAB[value] : undefined;
  return {
    segment: legacy?.segment ?? "todos",
    view: legacy?.view ?? "geral",
    preset: legacy?.preset,
  };
}

export function resolveMetasTab(value: string | undefined): MetasTab {
  return METAS_TABS.some((t) => t.key === value) ? (value as MetasTab) : "objetivos";
}

export function resolveReunioesView(value: string | undefined): ReunioesView {
  if (value === "agenda" || value === "calendar" || value === "requests") return value;
  // Compat com links antigos salvos/compartilhados antes da Fase 3 (valor
  // em português, subnav de sidebar) — nunca quebra, só traduz.
  if (value === "calendario") return "calendar";
  if (value === "solicitacoes") return "requests";
  return "agenda";
}

/** Chave de cada seção interna de Configurações — mesma lista que já
 * existia como `TabKey` local em `ConfiguracoesSection.tsx`, só que agora
 * fica na URL (`?configTab=`) em vez de só `useState`. "novidades" saiu
 * daqui de propósito: o changelog não é mais uma aba de Configurações. */
export type ConfigTab =
  | "perfil"
  | "preferencias"
  | "disponibilidade"
  | "workspace"
  | "integracoes"
  | "precificacao"
  | "time_permissoes"
  | "seguranca"
  | "cofre"
  | "dados_backup"
  | "score_operacional"
  | "log_auditoria";

const CONFIG_TAB_VALUES: ConfigTab[] = [
  "perfil",
  "preferencias",
  "disponibilidade",
  "workspace",
  "integracoes",
  "precificacao",
  "time_permissoes",
  "seguranca",
  "cofre",
  "dados_backup",
  "score_operacional",
  "log_auditoria",
];

export function resolveConfigTab(value: string | undefined): ConfigTab {
  return CONFIG_TAB_VALUES.includes(value as ConfigTab) ? (value as ConfigTab) : "perfil";
}
