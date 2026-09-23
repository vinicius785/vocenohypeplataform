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
  | "configuracoes";

export type FinanceiroTab =
  | "resumo"
  | "movimentacoes"
  | "a-receber"
  | "a-pagar"
  | "campanhas"
  | "relatorios";

export const FINANCEIRO_TABS: { key: FinanceiroTab; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "movimentacoes", label: "Movimentações" },
  { key: "a-receber", label: "A receber" },
  { key: "a-pagar", label: "A pagar" },
  { key: "campanhas", label: "Campanhas" },
  { key: "relatorios", label: "Relatórios" },
];

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

/** Só os módulos com subitens de sidebar nesta etapa. "Time" perdeu o
 * próprio subnav quando a subpágina "Horas trabalhadas" foi incorporada
 * à "Visão da equipe" (única subpágina restante não precisa de um item
 * de navegação pra si mesma). "Reuniões" SAIU daqui na Fase 3 da
 * reconstrução — voltou a ser um `SegmentedControl` + botão dentro da
 * própria página (`ReunioesSection.tsx`), não mais 3 subitens de sidebar;
 * a sidebar agora só tem o item principal "Reuniões". */
export const SECTION_SUBNAV: Partial<Record<SectionKey, { key: string; label: string }[]>> = {
  financeiro: FINANCEIRO_TABS,
  metas: METAS_TABS,
};

export function resolveFinanceiroTab(value: string | undefined): FinanceiroTab {
  return FINANCEIRO_TABS.some((t) => t.key === value) ? (value as FinanceiroTab) : "resumo";
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
  | "dados_backup"
  | "score_operacional"
  | "hypito"
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
  "dados_backup",
  "score_operacional",
  "hypito",
  "log_auditoria",
];

export function resolveConfigTab(value: string | undefined): ConfigTab {
  return CONFIG_TAB_VALUES.includes(value as ConfigTab) ? (value as ConfigTab) : "perfil";
}
