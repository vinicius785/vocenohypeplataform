/**
 * Fonte única de verdade para os dois eixos de status do fluxo de
 * campanhas de influenciadores — separados de propósito:
 *
 * - `InfluStatus`: a jornada do PERFIL do influenciador na campanha
 *   (inscrição → curadoria → aprovação do cliente → produção → conclusão).
 * - `EntregaStatus` (+ `EntregaEtapa`): a produção/aprovação de CADA
 *   entrega (roteiro OU conteúdo final — a etapa é um campo à parte, não
 *   um status próprio).
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

export const ENTREGA_STATUSES = [
  "COMBINADA",
  "EM_PRODUCAO",
  "AGUARDANDO_APROVACAO",
  "AJUSTES_SOLICITADOS",
  "APROVADA",
  "PUBLICADA",
] as const;
export type EntregaStatus = (typeof ENTREGA_STATUSES)[number];

export type EntregaEtapa = "roteiro" | "gravacao" | "conteudo" | "publicacao";

export const ENTREGA_ETAPA_LABEL: Record<EntregaEtapa, string> = {
  roteiro: "Roteiro",
  gravacao: "Gravação",
  conteudo: "Conteúdo",
  publicacao: "Publicação",
};

/** Ordem de progressão da etapa — usada pra renderizar o checklist ✓/●/○. */
export const ENTREGA_ETAPA_ORDER: EntregaEtapa[] = [
  "roteiro",
  "gravacao",
  "conteudo",
  "publicacao",
];

export const ENTREGA_STATUS_LABEL: Record<EntregaStatus, string> = {
  COMBINADA: "Combinada",
  EM_PRODUCAO: "Em produção",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  AJUSTES_SOLICITADOS: "Ajustes solicitados",
  APROVADA: "Aprovada",
  PUBLICADA: "Publicada",
};

/** Rótulos simplificados pro cliente (portal). */
export const ENTREGA_STATUS_LABEL_CLIENTE: Record<EntregaStatus, string> = {
  COMBINADA: "Em produção",
  EM_PRODUCAO: "Em produção",
  AGUARDANDO_APROVACAO: "Aguardando sua aprovação",
  AJUSTES_SOLICITADOS: "Ajustes solicitados",
  APROVADA: "Aprovado",
  PUBLICADA: "Publicado",
};

export const ENTREGA_STATUS_TONE: Record<EntregaStatus, string> = {
  COMBINADA: "bg-muted text-muted-foreground",
  EM_PRODUCAO: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  AGUARDANDO_APROVACAO: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  AJUSTES_SOLICITADOS: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  APROVADA: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  PUBLICADA: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};
export const ENTREGA_STATUS_BORDER: Record<EntregaStatus, string> = {
  COMBINADA: "border-muted-foreground/40",
  EM_PRODUCAO: "border-sky-500",
  AGUARDANDO_APROVACAO: "border-amber-500",
  AJUSTES_SOLICITADOS: "border-orange-500",
  APROVADA: "border-teal-500",
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

export function nextActionForEntrega(status: EntregaStatus): NextActor {
  switch (status) {
    case "COMBINADA":
    case "EM_PRODUCAO":
      return "hype";
    case "AGUARDANDO_APROVACAO":
      return "cliente";
    case "AJUSTES_SOLICITADOS":
      return "hype";
    case "APROVADA":
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

const ENTREGA_TRANSITIONS: Record<EntregaStatus, EntregaStatus[]> = {
  COMBINADA: ["EM_PRODUCAO"],
  EM_PRODUCAO: ["COMBINADA", "AGUARDANDO_APROVACAO"],
  AGUARDANDO_APROVACAO: ["APROVADA", "AJUSTES_SOLICITADOS"],
  AJUSTES_SOLICITADOS: ["EM_PRODUCAO", "AGUARDANDO_APROVACAO"],
  APROVADA: ["PUBLICADA", "EM_PRODUCAO"],
  PUBLICADA: [],
};
export function canTransitionEntrega(from: EntregaStatus, to: EntregaStatus): boolean {
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

const LEGACY_ENTREGA_MAP: Record<string, { status: EntregaStatus; etapa: EntregaEtapa }> = {
  Combinado: { status: "COMBINADA", etapa: "roteiro" },
  "Aguardando roteiro": { status: "EM_PRODUCAO", etapa: "roteiro" },
  "Aguardando aprovação de roteiro": { status: "AGUARDANDO_APROVACAO", etapa: "roteiro" },
  "Roteiro aprovado": { status: "APROVADA", etapa: "roteiro" },
  "Em gravação": { status: "EM_PRODUCAO", etapa: "conteudo" },
  "Aprovação conteúdo": { status: "AGUARDANDO_APROVACAO", etapa: "conteudo" },
  "Conteúdo aprovado": { status: "APROVADA", etapa: "conteudo" },
  Postado: { status: "PUBLICADA", etapa: "conteudo" },
};

/** Traduz uma etapa antiga (só "roteiro"/"conteudo" existiam antes) ou
 * ausente pro novo enum de 4 valores — não sobrescreve nada no banco, só
 * normaliza na leitura. Qualquer valor já válido passa direto. */
export function legacyEntregaEtapa(raw: string | undefined): EntregaEtapa {
  if (raw && (ENTREGA_ETAPA_ORDER as readonly string[]).includes(raw)) {
    return raw as EntregaEtapa;
  }
  return "roteiro";
}

export function legacyEntregaStatus(
  raw: string | undefined,
  currentEtapa?: EntregaEtapa,
): { status: EntregaStatus; etapa: EntregaEtapa } {
  if (!raw) return { status: "COMBINADA", etapa: currentEtapa ?? "roteiro" };
  if ((ENTREGA_STATUSES as readonly string[]).includes(raw)) {
    return { status: raw as EntregaStatus, etapa: currentEtapa ?? "roteiro" };
  }
  return LEGACY_ENTREGA_MAP[raw] ?? { status: "COMBINADA", etapa: currentEtapa ?? "roteiro" };
}
