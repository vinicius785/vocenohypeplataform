/**
 * Fonte única de verdade para os dois eixos de status do fluxo de
 * campanhas de influenciadores — separados de propósito:
 *
 * - `InfluStatus`: a jornada do PERFIL do influenciador na campanha
 *   (inscrição → curadoria → aprovação do cliente → produção → conclusão).
 * - `EntregaStage`: um ÚNICO campo linear com a produção/aprovação de
 *   CADA entrega. Antes existiam dois campos cruzados (`conteudoStatus` +
 *   `etapa`), com o mesmo status reusado tanto pro ciclo de aprovação do
 *   roteiro quanto do conteúdo final (só a etapa, separada, desempatava
 *   qual dos dois) — difícil de acompanhar e ambíguo por natureza. Cada
 *   valor de `EntregaStage` já diz sozinho O QUÊ está em jogo (ver
 *   comentário acima do tipo).
 *
 * Puro (sem React/browser), importável tanto do client (InfluencerBoard,
 * CampanhasSection, AppShell) quanto de server functions (cliente-link,
 * inscricao-campanha).
 */

// ============================================================
// Influenciador
// ============================================================

export const INFLU_STATUSES = [
  "INSCRITO",
  "EM_CURADORIA",
  "ENVIADO_AO_CLIENTE",
  "APROVADO",
  "EM_PRODUCAO",
  "CONCLUIDO",
  "RECUSADO",
] as const;
export type InfluStatus = (typeof INFLU_STATUSES)[number];

/** Ordem de exibição no Kanban — RECUSADO fica fora do fluxo linear
 * principal (é um estado terminal alternativo, não uma etapa a mais). */
export const INFLU_KANBAN_ORDER: InfluStatus[] = [
  "INSCRITO",
  "EM_CURADORIA",
  "ENVIADO_AO_CLIENTE",
  "APROVADO",
  "EM_PRODUCAO",
  "CONCLUIDO",
];

export const INFLU_STATUS_LABEL: Record<InfluStatus, string> = {
  INSCRITO: "Inscrito",
  EM_CURADORIA: "Em curadoria",
  ENVIADO_AO_CLIENTE: "Enviado ao cliente",
  APROVADO: "Aprovado",
  EM_PRODUCAO: "Em produção",
  CONCLUIDO: "Concluído",
  RECUSADO: "Recusado",
};

/** Rótulos simplificados mostrados ao CLIENTE no portal — evita expor
 * vocabulário operacional interno ("curadoria", "em produção" no sentido
 * de time interno vs. produção de conteúdo, etc). */
export const INFLU_STATUS_LABEL_CLIENTE: Record<InfluStatus, string> = {
  INSCRITO: "Em análise",
  EM_CURADORIA: "Em análise",
  ENVIADO_AO_CLIENTE: "Aguardando sua aprovação",
  APROVADO: "Aprovado",
  EM_PRODUCAO: "Aprovado",
  CONCLUIDO: "Aprovado",
  RECUSADO: "Recusado",
};

export const INFLU_STATUS_TONE: Record<InfluStatus, string> = {
  INSCRITO: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  EM_CURADORIA: "bg-muted text-muted-foreground",
  ENVIADO_AO_CLIENTE: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  APROVADO: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  EM_PRODUCAO: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  CONCLUIDO: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  RECUSADO: "bg-red-500/10 text-red-700 dark:text-red-400",
};
export const INFLU_STATUS_BORDER: Record<InfluStatus, string> = {
  INSCRITO: "border-blue-500",
  EM_CURADORIA: "border-muted-foreground/40",
  ENVIADO_AO_CLIENTE: "border-amber-500",
  APROVADO: "border-emerald-500",
  EM_PRODUCAO: "border-sky-500",
  CONCLUIDO: "border-violet-500",
  RECUSADO: "border-red-500",
};

// ============================================================
// Entrega
// ============================================================

/**
 * Um único campo linear pra produção/aprovação de UMA entrega — cada
 * valor já diz sozinho o quê está em jogo, sem precisar de um segundo
 * campo (etapa) pra desempatar:
 *
 *   ROTEIRO_PRODUCAO   → time escrevendo/gravando o roteiro
 *   ROTEIRO_APROVACAO  → aguardando o CLIENTE aprovar o roteiro
 *   ROTEIRO_AJUSTES    → cliente pediu ajuste no ROTEIRO
 *   PRODUCAO           → time produzindo o conteúdo final (inclui a
 *                         antiga etapa "gravação", que nunca bloqueava
 *                         ninguém e não ganhava nada como estágio à parte)
 *   CONTEUDO_APROVACAO → aguardando o CLIENTE aprovar o conteúdo final
 *   CONTEUDO_AJUSTES   → cliente pediu ajuste no CONTEÚDO FINAL
 *   PUBLICACAO         → aprovado, falta publicar
 *   PUBLICADA          → concluída
 *
 * Toda entrega nova já nasce em ROTEIRO_PRODUCAO (não existe mais um
 * status "nem começou" à parte — não mudava nada na prática, só exigia
 * um clique a mais).
 */
export const ENTREGA_STAGES = [
  "ROTEIRO_PRODUCAO",
  "ROTEIRO_APROVACAO",
  "ROTEIRO_AJUSTES",
  "PRODUCAO",
  "CONTEUDO_APROVACAO",
  "CONTEUDO_AJUSTES",
  "PUBLICACAO",
  "PUBLICADA",
] as const;
export type EntregaStage = (typeof ENTREGA_STAGES)[number];

/** Ordem de progressão — usada pra renderizar o checklist ✓/●/○. Os dois
 * ciclos de ajuste (ROTEIRO_AJUSTES/CONTEUDO_AJUSTES) não entram aqui:
 * são desvios do fluxo linear, não um degrau a mais pra frente. */
export const ENTREGA_STAGE_ORDER: EntregaStage[] = [
  "ROTEIRO_PRODUCAO",
  "ROTEIRO_APROVACAO",
  "PRODUCAO",
  "CONTEUDO_APROVACAO",
  "PUBLICACAO",
  "PUBLICADA",
];

export const ENTREGA_STAGE_LABEL: Record<EntregaStage, string> = {
  ROTEIRO_PRODUCAO: "Escrevendo roteiro",
  ROTEIRO_APROVACAO: "Roteiro aguardando cliente",
  ROTEIRO_AJUSTES: "Roteiro — ajustes pedidos",
  PRODUCAO: "Em produção",
  CONTEUDO_APROVACAO: "Conteúdo aguardando cliente",
  CONTEUDO_AJUSTES: "Conteúdo final — ajustes pedidos",
  PUBLICACAO: "Aprovado — falta publicar",
  PUBLICADA: "Publicada",
};

/** Rótulos simplificados pro cliente (portal) — já cravam "(roteiro)"/
 * "(conteúdo)" nos dois estágios de decisão, pra nunca ficar ambíguo o
 * que está sendo aprovado/ajustado. */
export const ENTREGA_STAGE_LABEL_CLIENTE: Record<EntregaStage, string> = {
  ROTEIRO_PRODUCAO: "Em produção",
  ROTEIRO_APROVACAO: "Aguardando sua aprovação (roteiro)",
  ROTEIRO_AJUSTES: "Ajustes solicitados (roteiro)",
  PRODUCAO: "Em produção",
  CONTEUDO_APROVACAO: "Aguardando sua aprovação (conteúdo)",
  CONTEUDO_AJUSTES: "Ajustes solicitados (conteúdo)",
  PUBLICACAO: "Aprovado",
  PUBLICADA: "Publicado",
};

export const ENTREGA_STAGE_TONE: Record<EntregaStage, string> = {
  ROTEIRO_PRODUCAO: "bg-muted text-muted-foreground",
  ROTEIRO_APROVACAO: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ROTEIRO_AJUSTES: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  PRODUCAO: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  CONTEUDO_APROVACAO: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  CONTEUDO_AJUSTES: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  PUBLICACAO: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  PUBLICADA: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};
export const ENTREGA_STAGE_BORDER: Record<EntregaStage, string> = {
  ROTEIRO_PRODUCAO: "border-muted-foreground/40",
  ROTEIRO_APROVACAO: "border-amber-500",
  ROTEIRO_AJUSTES: "border-orange-500",
  PRODUCAO: "border-sky-500",
  CONTEUDO_APROVACAO: "border-amber-500",
  CONTEUDO_AJUSTES: "border-orange-500",
  PUBLICACAO: "border-teal-500",
  PUBLICADA: "border-emerald-500",
};

// ============================================================
// Próxima ação — "quem precisa agir?"
// ============================================================

export type NextActor = "hype" | "cliente" | "influenciador" | null;

export const NEXT_ACTOR_LABEL: Record<Exclude<NextActor, null>, string> = {
  hype: "VNH",
  cliente: "Cliente",
  influenciador: "Influenciador",
};

export function nextActionForInflu(status: InfluStatus): NextActor {
  switch (status) {
    case "INSCRITO":
    case "EM_CURADORIA":
      return "hype";
    case "ENVIADO_AO_CLIENTE":
      return "cliente";
    case "APROVADO":
    case "EM_PRODUCAO":
      return "hype";
    case "CONCLUIDO":
    case "RECUSADO":
      return null;
  }
}

export function nextActionForEntrega(stage: EntregaStage): NextActor {
  switch (stage) {
    case "ROTEIRO_PRODUCAO":
    case "PRODUCAO":
      return "hype";
    case "ROTEIRO_APROVACAO":
    case "CONTEUDO_APROVACAO":
      return "cliente";
    case "ROTEIRO_AJUSTES":
    case "CONTEUDO_AJUSTES":
      return "hype";
    case "PUBLICACAO":
      return "hype"; // falta publicar
    case "PUBLICADA":
      return null;
  }
}

// ============================================================
// Transições permitidas (evita "PUBLICADA → EM_CURADORIA" etc)
// ============================================================

const INFLU_TRANSITIONS: Record<InfluStatus, InfluStatus[]> = {
  INSCRITO: ["EM_CURADORIA", "RECUSADO"],
  EM_CURADORIA: ["INSCRITO", "ENVIADO_AO_CLIENTE", "RECUSADO"],
  ENVIADO_AO_CLIENTE: ["EM_CURADORIA", "APROVADO", "RECUSADO"],
  APROVADO: ["EM_PRODUCAO", "CONCLUIDO"],
  EM_PRODUCAO: ["APROVADO", "CONCLUIDO"],
  CONCLUIDO: ["EM_PRODUCAO"],
  RECUSADO: ["EM_CURADORIA"],
};
export function canTransitionInflu(from: InfluStatus, to: InfluStatus): boolean {
  return from === to || (INFLU_TRANSITIONS[from] ?? []).includes(to);
}

const ENTREGA_TRANSITIONS: Record<EntregaStage, EntregaStage[]> = {
  ROTEIRO_PRODUCAO: ["ROTEIRO_APROVACAO"],
  ROTEIRO_APROVACAO: ["PRODUCAO", "ROTEIRO_AJUSTES"],
  ROTEIRO_AJUSTES: ["ROTEIRO_PRODUCAO"],
  PRODUCAO: ["CONTEUDO_APROVACAO"],
  CONTEUDO_APROVACAO: ["PUBLICACAO", "CONTEUDO_AJUSTES"],
  CONTEUDO_AJUSTES: ["PRODUCAO"],
  PUBLICACAO: ["PUBLICADA"],
  PUBLICADA: [],
};
export function canTransitionEntrega(from: EntregaStage, to: EntregaStage): boolean {
  return from === to || (ENTREGA_TRANSITIONS[from] ?? []).includes(to);
}

// ============================================================
// Migração de status antigos (sem tocar no banco — traduzido em runtime,
// tanto no VI quanto no VC, toda vez que um registro é lido).
// ============================================================

const LEGACY_INFLU_MAP: Record<string, InfluStatus> = {
  Inscrições: "INSCRITO",
  Lista: "EM_CURADORIA",
  "Enviado para aprovação": "ENVIADO_AO_CLIENTE",
  Aprovado: "APROVADO",
  "Aguardando roteiro": "EM_PRODUCAO",
  "Aprovação de roteiro": "EM_PRODUCAO",
  "Em gravação": "EM_PRODUCAO",
  "Aprovação de conteúdo": "EM_PRODUCAO",
  "Conteúdo aprovado": "EM_PRODUCAO",
  Postado: "EM_PRODUCAO", // vira CONCLUIDO em legacyInfluStatus se todas as entregas já publicadas
  Pago: "CONCLUIDO",
};

/** Traduz um status de influenciador (novo OU antigo) pro novo enum.
 * `hasReprovacao`/`allEntregasPublicadas` resolvem os dois casos que
 * dependem de mais contexto que só a string do status antigo. */
export function legacyInfluStatus(
  raw: string | undefined,
  opts: { hasReprovacao?: boolean; allEntregasPublicadas?: boolean } = {},
): InfluStatus {
  if (!raw) return "INSCRITO";
  if ((INFLU_STATUSES as readonly string[]).includes(raw)) return raw as InfluStatus;
  if (raw === "Enviado para aprovação" && opts.hasReprovacao) return "RECUSADO";
  if (raw === "Postado") return opts.allEntregasPublicadas ? "CONCLUIDO" : "EM_PRODUCAO";
  return LEGACY_INFLU_MAP[raw] ?? "EM_CURADORIA";
}

/** Status texto-livre de entrega usados antes do enum `EntregaStatus` de
 * 6 valores (o modelo intermediário, já substituído por `EntregaStage`). */
const LEGACY_ENTREGA_TEXT_MAP: Record<string, { status: string; etapa: string }> = {
  Combinado: { status: "COMBINADA", etapa: "roteiro" },
  "Aguardando roteiro": { status: "EM_PRODUCAO", etapa: "roteiro" },
  "Aguardando aprovação de roteiro": { status: "AGUARDANDO_APROVACAO", etapa: "roteiro" },
  "Roteiro aprovado": { status: "APROVADA", etapa: "roteiro" },
  "Em gravação": { status: "EM_PRODUCAO", etapa: "conteudo" },
  "Aprovação conteúdo": { status: "AGUARDANDO_APROVACAO", etapa: "conteudo" },
  "Conteúdo aprovado": { status: "APROVADA", etapa: "conteudo" },
  Postado: { status: "PUBLICADA", etapa: "conteudo" },
};

const OLD_ENTREGA_STATUSES = [
  "COMBINADA",
  "EM_PRODUCAO",
  "AGUARDANDO_APROVACAO",
  "AJUSTES_SOLICITADOS",
  "APROVADA",
  "PUBLICADA",
];

/**
 * Migração única (não roda em tempo de leitura) do modelo antigo — texto
 * livre antiquíssimo (`Combinado`, `Aguardando roteiro`, ...) OU o par
 * `conteudoStatus`+`etapa` de 6×4 valores que veio depois — pro novo
 * `EntregaStage` de 8 valores lineares. Usada só pelo script de backfill
 * que reescreve `campanha_influenciadores` uma vez; nenhum código de
 * runtime deve chamar isso (o campo `stage` já vem certo do banco depois
 * do backfill).
 */
export function migrateLegacyEntregaStage(
  rawStatus: string | undefined,
  rawEtapa: string | undefined,
): EntregaStage {
  // Normaliza pro par (status, etapa) do modelo intermediário primeiro,
  // traduzindo texto-livre antiquíssimo se for o caso.
  let status = rawStatus;
  let etapa = rawEtapa;
  if (status && !OLD_ENTREGA_STATUSES.includes(status)) {
    const mapped = LEGACY_ENTREGA_TEXT_MAP[status];
    if (mapped) {
      status = mapped.status;
      etapa = etapa ?? mapped.etapa;
    } else {
      status = undefined;
    }
  }
  if (!status) return "ROTEIRO_PRODUCAO";
  const etapaRoteiro = !etapa || etapa === "roteiro";

  switch (status) {
    case "COMBINADA":
      return "ROTEIRO_PRODUCAO";
    case "EM_PRODUCAO":
      return etapaRoteiro ? "ROTEIRO_PRODUCAO" : "PRODUCAO";
    case "AGUARDANDO_APROVACAO":
      return etapaRoteiro ? "ROTEIRO_APROVACAO" : "CONTEUDO_APROVACAO";
    case "AJUSTES_SOLICITADOS":
      return etapaRoteiro ? "ROTEIRO_AJUSTES" : "CONTEUDO_AJUSTES";
    case "APROVADA":
      // "Roteiro aprovado" (legado) já significava "pode partir pra
      // produção do conteúdo" — equivalente a PRODUCAO no modelo novo.
      return etapaRoteiro ? "PRODUCAO" : "PUBLICACAO";
    case "PUBLICADA":
      return "PUBLICADA";
    default:
      return "ROTEIRO_PRODUCAO";
  }
}
