import type { Lead, OpportunityHistoryKind, PropostaSnapshot } from "@/lib/comercial";
import { formatBRL } from "@/lib/comercial";

/**
 * Motor de próxima ação do Comercial — mesmo princípio já validado em
 * `entrega-engine.ts`: AÇÃO → SISTEMA ATUALIZA O ESTADO. Única fonte de
 * verdade pra status/etapa, ator responsável pela próxima ação e o rótulo
 * do botão — usada pelo card do kanban, pelo drawer da oportunidade, pelo
 * resumo lateral e pelo dashboard, nunca duplicada em cada componente.
 *
 * Diferente do motor de entregas, este é DELIBERADAMENTE permissivo: o
 * comercial real foge do fluxo ideal o tempo todo (reunião cancelada,
 * proposta revisada depois de enviada, negociação que volta pra proposta,
 * venda que fica parada e retoma). O motor nunca bloqueia uma ação por
 * "estado de origem errado" — ele só define QUAL ação faz sentido mostrar
 * como principal AGORA, e qualquer transição (inclusive pra trás) fica
 * disponível via ação explícita ou via "alterar etapa manualmente".
 */

export const OPPORTUNITY_STAGES = [
  "LEAD_RECEBIDO",
  "CONTATO_FEITO",
  "REUNIAO_AGENDADA",
  "REUNIAO_REALIZADA",
  "PROPOSTA_PREPARO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
  "GANHO",
  "PERDIDO",
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

/** Ordem de exibição no kanban — PERDIDO fica fora da linha principal
 * (é um estado terminal alternativo, não mais uma etapa a frente). */
export const OPPORTUNITY_KANBAN_ORDER: OpportunityStage[] = [
  "LEAD_RECEBIDO",
  "CONTATO_FEITO",
  "REUNIAO_AGENDADA",
  "REUNIAO_REALIZADA",
  "PROPOSTA_PREPARO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
  "GANHO",
];

export const OPPORTUNITY_STAGE_LABEL: Record<OpportunityStage, string> = {
  LEAD_RECEBIDO: "Lead recebido",
  CONTATO_FEITO: "Contato feito",
  REUNIAO_AGENDADA: "Reunião agendada",
  REUNIAO_REALIZADA: "Reunião realizada",
  PROPOSTA_PREPARO: "Proposta em preparação",
  PROPOSTA_ENVIADA: "Proposta enviada",
  NEGOCIACAO: "Negociação",
  GANHO: "Ganho",
  PERDIDO: "Perdido",
};

export const OPPORTUNITY_STAGE_TONE: Record<OpportunityStage, string> = {
  LEAD_RECEBIDO: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  CONTATO_FEITO: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  REUNIAO_AGENDADA: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  REUNIAO_REALIZADA: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  PROPOSTA_PREPARO: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  PROPOSTA_ENVIADA: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  NEGOCIACAO: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  GANHO: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  PERDIDO: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

export const OPPORTUNITY_STAGE_COLOR: Record<OpportunityStage, string> = {
  LEAD_RECEBIDO: "bg-sky-500",
  CONTATO_FEITO: "bg-indigo-500",
  REUNIAO_AGENDADA: "bg-indigo-500",
  REUNIAO_REALIZADA: "bg-violet-500",
  PROPOSTA_PREPARO: "bg-violet-500",
  PROPOSTA_ENVIADA: "bg-amber-500",
  NEGOCIACAO: "bg-amber-500",
  GANHO: "bg-emerald-500",
  PERDIDO: "bg-rose-500",
};

/**
 * Traduz o valor gravado no banco (novo OU um dos 6 valores antigos de
 * antes desta mudança) pro enum novo — nunca reescreve o registro, só
 * normaliza na leitura, mesmo padrão de `legacyInfluStatus`. O motor
 * SEMPRE trabalha em cima do valor normalizado — nunca em cima da string
 * crua — pra não existir duas fontes de verdade.
 */
const LEGACY_STAGE_MAP: Record<string, OpportunityStage> = {
  lead: "LEAD_RECEBIDO",
  contato: "CONTATO_FEITO",
  proposta: "PROPOSTA_PREPARO",
  negociacao: "NEGOCIACAO",
  ganho: "GANHO",
  perdido: "PERDIDO",
};
export function legacyStage(raw: string | undefined): OpportunityStage {
  if (!raw) return "LEAD_RECEBIDO";
  if ((OPPORTUNITY_STAGES as readonly string[]).includes(raw)) return raw as OpportunityStage;
  return LEGACY_STAGE_MAP[raw] ?? "LEAD_RECEBIDO";
}

/** Quem precisa agir agora — separado do "responsável pela oportunidade"
 * (`Lead.responsible`, o vendedor dono do lead, sempre manual). */
export type OpportunityActor = "HYPE" | "CLIENTE" | null;
export const OPPORTUNITY_ACTOR_LABEL: Record<Exclude<OpportunityActor, null>, string> = {
  HYPE: "VNH",
  CLIENTE: "Cliente",
};

function actorForStage(stage: OpportunityStage): OpportunityActor {
  switch (stage) {
    case "LEAD_RECEBIDO":
    case "CONTATO_FEITO":
    case "REUNIAO_AGENDADA":
    case "REUNIAO_REALIZADA":
    case "PROPOSTA_PREPARO":
      return "HYPE";
    case "PROPOSTA_ENVIADA":
      return "CLIENTE";
    case "NEGOCIACAO":
      return "HYPE";
    case "GANHO":
    case "PERDIDO":
      return null;
  }
}

export type OpportunityActionKind =
  | "registrar_contato"
  | "agendar_reuniao"
  | "registrar_reuniao"
  | "criar_proposta"
  | "enviar_proposta"
  | "revisar_proposta"
  | "registrar_negociacao"
  | "marcar_ganho"
  | "marcar_perdido"
  | "alterar_etapa_manual";

export type OpportunityNextStep = {
  stage: OpportunityStage;
  stageLabel: string;
  actor: OpportunityActor;
  actionLabel: string | null;
  action: OpportunityActionKind | null;
};

/** Leitura pura — status (onde está) é sempre distinto de próxima ação (o
 * que precisa acontecer agora); nunca vira um status novo. */
export function deriveOpportunityNextStep(lead: Pick<Lead, "stage">): OpportunityNextStep {
  const stage = legacyStage(lead.stage);
  const stageLabel = OPPORTUNITY_STAGE_LABEL[stage];
  const actor = actorForStage(stage);

  const step = (
    actionLabel: string | null,
    action: OpportunityActionKind | null,
  ): OpportunityNextStep => ({ stage, stageLabel, actor, actionLabel, action });

  switch (stage) {
    case "LEAD_RECEBIDO":
      return step("Registrar contato", "registrar_contato");
    case "CONTATO_FEITO":
      return step("Agendar reunião", "agendar_reuniao");
    case "REUNIAO_AGENDADA":
      return step("Registrar reunião", "registrar_reuniao");
    case "REUNIAO_REALIZADA":
      return step("Criar proposta", "criar_proposta");
    case "PROPOSTA_PREPARO":
      return step("Enviar proposta", "enviar_proposta");
    case "PROPOSTA_ENVIADA":
      // Aguardando cliente — não é ação do Hype, não mostra botão principal.
      return step(null, null);
    case "NEGOCIACAO":
      return step("Registrar atualização", "registrar_negociacao");
    case "GANHO":
    case "PERDIDO":
      return step(null, null);
  }
}

export type OpportunityActionOpts = {
  /** Data planejada da reunião (ISO), pra `agendar_reuniao`. */
  data?: string;
  /** Snapshot do simulador aplicado, pra `criar_proposta`/`revisar_proposta`. */
  proposta?: PropostaSnapshot;
  /** Nota livre da atualização, pra `registrar_negociacao`. */
  nota?: string;
  /** Novo valor negociado (se mudou), pra `registrar_negociacao`. */
  novoValor?: number;
  /** Valor final confirmado, pra `marcar_ganho`. */
  valorFinal?: number;
  /** Motivo da perda, pra `marcar_perdido`. */
  motivo?: string;
  /** Etapa de destino, só pra `alterar_etapa_manual`. */
  toStage?: OpportunityStage;
};

/** Uma entrada de histórico produzida por uma ação — `kind`/`fromStage`/
 * `toStage` são estruturados (nunca inferidos por parsing de `text` depois)
 * pra alimentar a timeline rica do drawer e, com volume, os relatórios de
 * conversão/tempo por etapa. */
export type OpportunityHistoryEntryDraft = {
  text: string;
  kind: OpportunityHistoryKind;
  fromStage?: OpportunityStage;
  toStage?: OpportunityStage;
};

export type OpportunityActionResult = {
  patch: Partial<Lead>;
  /** Uma ou mais linhas de histórico — a maioria das ações gera uma só,
   * mas ex. criar_proposta com ajuste manual de preço gera duas. */
  historyEntries: OpportunityHistoryEntryDraft[];
};

/**
 * Escrita pura — o único lugar que decide o patch de uma ação comercial.
 * Deliberadamente NÃO valida a etapa de origem (diferente do motor de
 * entregas): o comercial real pula etapas, revisita etapas anteriores e
 * corrige o curso o tempo todo, e isso é legítimo, não um erro de uso.
 * `actorName` é sempre o nome de quem executou, pra compor o texto do
 * histórico (nunca um texto genérico tipo "Etapa alterada").
 */
export function applyOpportunityAction(
  lead: Lead,
  action: OpportunityActionKind,
  actorName: string,
  opts: OpportunityActionOpts = {},
): OpportunityActionResult {
  const from = legacyStage(lead.stage);

  switch (action) {
    case "registrar_contato":
      return {
        patch: { stage: "CONTATO_FEITO" },
        historyEntries: [
          {
            text: `${actorName} registrou contato.`,
            kind: "stage_change",
            fromStage: from,
            toStage: "CONTATO_FEITO",
          },
        ],
      };

    case "agendar_reuniao":
      return {
        patch: { stage: "REUNIAO_AGENDADA", nextMeeting: opts.data },
        historyEntries: [
          {
            text: opts.data
              ? `${actorName} agendou reunião para ${formatDateBR(opts.data)}.`
              : `${actorName} agendou reunião.`,
            kind: "meeting",
            fromStage: from,
            toStage: "REUNIAO_AGENDADA",
          },
        ],
      };

    case "registrar_reuniao":
      return {
        patch: { stage: "REUNIAO_REALIZADA" },
        historyEntries: [
          {
            text: `${actorName} registrou a reunião realizada.`,
            kind: "meeting",
            fromStage: from,
            toStage: "REUNIAO_REALIZADA",
          },
        ],
      };

    case "criar_proposta": {
      const proposta = opts.proposta;
      const valor = proposta?.precoFinal ?? lead.value;
      const entries: OpportunityHistoryEntryDraft[] = [
        {
          text: `${actorName} criou proposta de ${formatBRL(valor)}.`,
          kind: "proposal",
          fromStage: from,
          toStage: "PROPOSTA_PREPARO",
        },
      ];
      if (proposta?.ajustadoManualmente && proposta.precoCalculado !== undefined) {
        entries.push({
          text: `${actorName} ajustou o preço comercial de ${formatBRL(proposta.precoCalculado)} para ${formatBRL(proposta.precoFinal)}.`,
          kind: "value_change",
        });
      }
      return {
        patch: { stage: "PROPOSTA_PREPARO", value: valor, proposta },
        historyEntries: entries,
      };
    }

    case "enviar_proposta":
      return {
        patch: { stage: "PROPOSTA_ENVIADA" },
        historyEntries: [
          {
            text: `${actorName} enviou proposta de ${formatBRL(lead.value)} ao cliente.`,
            kind: "proposal",
            fromStage: from,
            toStage: "PROPOSTA_ENVIADA",
          },
        ],
      };

    case "revisar_proposta":
      return {
        patch: { stage: "PROPOSTA_PREPARO" },
        historyEntries: [
          {
            text: `${actorName} reabriu a proposta para revisão.`,
            kind: "proposal",
            fromStage: from,
            toStage: "PROPOSTA_PREPARO",
          },
        ],
      };

    case "registrar_negociacao": {
      const patch: Partial<Lead> = { stage: "NEGOCIACAO" };
      const entries: OpportunityHistoryEntryDraft[] = [];
      if (opts.novoValor !== undefined && opts.novoValor !== lead.value) {
        entries.push({
          text: `${actorName} atualizou o valor da negociação de ${formatBRL(lead.value)} para ${formatBRL(opts.novoValor)}.`,
          kind: "value_change",
        });
        patch.value = opts.novoValor;
      }
      entries.push({
        text: opts.nota
          ? `${actorName} registrou atualização na negociação: ${opts.nota}`
          : `${actorName} registrou atualização na negociação.`,
        kind: "negotiation",
        fromStage: from,
        toStage: "NEGOCIACAO",
      });
      return { patch, historyEntries: entries };
    }

    case "marcar_ganho": {
      const valorFinal = opts.valorFinal ?? lead.value;
      return {
        patch: { stage: "GANHO", value: valorFinal, wonAt: new Date().toISOString() },
        historyEntries: [
          {
            text: `${actorName} marcou a oportunidade como ganha — ${formatBRL(valorFinal)}.`,
            kind: "won",
            fromStage: from,
            toStage: "GANHO",
          },
        ],
      };
    }

    case "marcar_perdido":
      return {
        patch: { stage: "PERDIDO", lossReason: opts.motivo, lostAt: new Date().toISOString() },
        historyEntries: [
          {
            text: opts.motivo
              ? `${actorName} marcou a oportunidade como perdida — motivo: ${opts.motivo}.`
              : `${actorName} marcou a oportunidade como perdida.`,
            kind: "lost",
            fromStage: from,
            toStage: "PERDIDO",
          },
        ],
      };

    case "alterar_etapa_manual": {
      const to = opts.toStage ?? from;
      return {
        patch: { stage: to },
        historyEntries: [
          {
            text: `${actorName} alterou manualmente: ${OPPORTUNITY_STAGE_LABEL[from]} → ${OPPORTUNITY_STAGE_LABEL[to]}.`,
            kind: "stage_change",
            fromStage: from,
            toStage: to,
          },
        ],
      };
    }
  }
}

function formatDateBR(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** "Tempo na etapa" / "Parado há X dias" — calculado do histórico (a
 * última entrada de mudança de etapa), nunca de um campo manual. */
export function daysSinceLastStageChange(lead: Pick<Lead, "history" | "updatedAt">): number {
  const stageEntries = (lead.history ?? []).filter(
    (h) => h.type === "stage" || h.type === "created",
  );
  const lastAt =
    stageEntries.length > 0 ? Math.max(...stageEntries.map((h) => h.createdAt)) : lead.updatedAt;
  const diffMs = Date.now() - lastAt;
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

/** Limiar único de "parada no funil" — mesmo valor em badge do card, KPI,
 * filtro e resumo do drawer (antes havia uma segunda definição, por
 * `updatedAt`, divergente desta). */
export const OPPORTUNITY_STALE_DAYS = 5;

/** Uma oportunidade está "parada" quando não é terminal (GANHO/PERDIDO) E
 * não muda de etapa há `OPPORTUNITY_STALE_DAYS` dias ou mais — nunca por
 * `updatedAt` cru (editar uma observação não é "progresso"). Única fonte
 * de verdade pro conceito de "parado" no módulo Comercial. */
export function isOpportunityStale(lead: Pick<Lead, "stage" | "history" | "updatedAt">): boolean {
  const stage = legacyStage(lead.stage);
  if (stage === "GANHO" || stage === "PERDIDO") return false;
  return daysSinceLastStageChange(lead) >= OPPORTUNITY_STALE_DAYS;
}
