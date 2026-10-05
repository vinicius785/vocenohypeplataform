import { canTransitionInflu, type EntregaStage, type InfluStatus } from "@/lib/campanha-status";
import { deriveEntregaNextStep, type EntregaEngineActionKind } from "@/lib/entrega-engine";
import { entregaAjusteView, type AjustePhase } from "@/lib/entrega-ajustes";
import type { Entrega, Influ } from "@/lib/influencer-model";

/**
 * Regras PURAS da V2 do detalhe do influenciador: "próxima melhor ação", tom de cada entrega e
 * feedbacks do cliente. Só LÊ o estado que já existe (status, entregas e ciclo de ajustes) —
 * nenhuma regra de negócio nova. O financeiro NÃO entra aqui: ele vive em Recursos → Financeiro.
 */

export type NextAction =
  | { kind: "avancar_status"; area: string; hint: string; label: string; to: InfluStatus }
  | { kind: "enviar_cliente"; area: string; hint: string; label: string }
  | { kind: "adicionar_entrega"; area: string; hint: string; label: string }
  | {
      kind: "entrega";
      area: string;
      entregaId: string;
      entregaNome: string;
      hint: string;
      label: string;
      action: EntregaEngineActionKind;
      /** Quantas outras entregas também pedem ação (sem listá-las — só um número discreto). */
      others: number;
    }
  | {
      kind: "aguardando";
      area: string;
      hint: string;
      /** Entrega a abrir em "Ver ..." (quando a espera é por uma entrega específica). */
      entregaId?: string;
      label?: string;
    }
  | { kind: "nenhuma"; area: string; hint: string };

export function entregaNome(e: Pick<Entrega, "tipo" | "titulo">): string {
  return e.titulo ? `${e.tipo} · ${e.titulo}` : e.tipo || "Entrega";
}

function areaOfAction(a: EntregaEngineActionKind): string {
  if (a.endsWith("roteiro")) return "Roteiro";
  if (a.endsWith("conteudo")) return "Conteúdo final";
  return "Publicação";
}

const ACTION_HINT: Record<EntregaEngineActionKind, string> = {
  anexar_roteiro: "Nenhum roteiro anexado ainda",
  enviar_roteiro: "Roteiro anexado, pronto para enviar ao cliente",
  reconhecer_ajustes_roteiro: "O cliente pediu ajustes no roteiro",
  anexar_conteudo: "Nenhum conteúdo final anexado ainda",
  enviar_conteudo: "Conteúdo anexado, pronto para enviar ao cliente",
  reconhecer_ajustes_conteudo: "O cliente pediu ajustes no conteúdo final",
  marcar_publicado: "Aprovado pelo cliente — falta publicar",
};

function nextPrazo(e: Entrega): string | undefined {
  return [e.dataRecebimentoRoteiro, e.dataRecebimentoConteudo, e.dataPostagem]
    .filter((d): d is string => !!d && !Number.isNaN(new Date(d).getTime()))
    .sort()
    .at(-1);
}

export function nextBestAction(influ: Influ): NextAction {
  switch (influ.status) {
    case "RECUSADO":
      return { kind: "nenhuma", area: "Status", hint: "Este influenciador não foi aprovado." };
    case "INSCRITO":
      return canTransitionInflu("INSCRITO", "EM_CURADORIA")
        ? {
            kind: "avancar_status",
            area: "Inscrição",
            hint: "Inscrição recebida, ainda não analisada",
            label: "Mover para curadoria",
            to: "EM_CURADORIA",
          }
        : { kind: "nenhuma", area: "Inscrição", hint: "Inscrição recebida." };
    case "EM_CURADORIA":
      return {
        kind: "enviar_cliente",
        area: "Curadoria",
        hint: "Pronto para o cliente avaliar",
        label: "Enviar para o cliente",
      };
    case "ENVIADO_AO_CLIENTE":
      return { kind: "aguardando", area: "Aprovação", hint: "Aguardando decisão do cliente" };
  }

  if (influ.entregas.length === 0) {
    return {
      kind: "adicionar_entrega",
      area: "Entregas",
      hint: "Aprovado — defina o que ele precisa entregar",
      label: "Adicionar entrega",
    };
  }

  const steps = influ.entregas.map((e) => ({
    e,
    step: deriveEntregaNextStep(e),
    ajuste: entregaAjusteView(e),
    prazo: nextPrazo(e),
  }));
  const actionable = steps
    .filter((s) => s.step.action)
    .sort((a, b) => {
      // O cliente pediu ajustes → vem antes de qualquer outra coisa; depois, o prazo mais próximo.
      const pa = a.ajuste?.phase === "solicitados" ? 0 : 1;
      const pb = b.ajuste?.phase === "solicitados" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (!a.prazo && !b.prazo) return 0;
      if (!a.prazo) return 1;
      if (!b.prazo) return -1;
      return a.prazo.localeCompare(b.prazo);
    });
  const top = actionable[0];
  if (top?.step.action) {
    return {
      kind: "entrega",
      area: areaOfAction(top.step.action),
      entregaId: top.e.id,
      entregaNome: entregaNome(top.e),
      hint: ACTION_HINT[top.step.action],
      label: top.step.actionLabel ?? "Abrir entrega",
      action: top.step.action,
      others: actionable.length - 1,
    };
  }

  const waiting = steps.find((s) => !s.step.action && s.step.responsavel === "cliente");
  if (waiting) {
    const etapa = waiting.e.stage === "CONTEUDO_APROVACAO" ? "conteúdo" : "roteiro";
    return {
      kind: "aguardando",
      area: etapa === "roteiro" ? "Roteiro" : "Conteúdo final",
      hint: `Aguardando aprovação do cliente · ${entregaNome(waiting.e)}`,
      entregaId: waiting.e.id,
      label: etapa === "roteiro" ? "Ver roteiro" : "Ver conteúdo",
    };
  }

  return { kind: "nenhuma", area: "Tudo em dia", hint: "Nenhuma ação pendente agora." };
}

/* ---------------- Entregas ---------------- */

export type EntregaTone = "ok" | "waiting" | "alert" | "progress" | "neutral";

export function entregaTone(
  e: Pick<Entrega, "stage" | "roteiroReprovacao" | "conteudoReprovacao">,
): EntregaTone {
  const stage: EntregaStage = e.stage ?? "ROTEIRO_PRODUCAO";
  const ajuste = entregaAjusteView(e);
  if (ajuste && ajuste.phase !== "reenviado") return "alert";
  switch (stage) {
    case "PUBLICADA":
    case "PUBLICACAO":
      return "ok";
    case "ROTEIRO_APROVACAO":
    case "CONTEUDO_APROVACAO":
      return "waiting";
    case "ROTEIRO_AJUSTES":
    case "CONTEUDO_AJUSTES":
      return "alert";
    default:
      return "progress";
  }
}

/* ---------------- Feedback do cliente ---------------- */

export type ClientFeedback = {
  key: string;
  /** Entrega a abrir em "Ver feedback completo" (ausente quando o feedback é sobre o influenciador). */
  entregaId?: string;
  entregaNome?: string;
  etapaLabel: string;
  motivo: string;
  respondedAt: string;
  autorNome?: string;
  phase?: AjustePhase;
  statusLabel: string;
};

/** Feedbacks do cliente ainda "vivos" (o carimbo só some quando ele aprova), do mais recente ao mais antigo. */
export function clientFeedbacks(influ: Influ): ClientFeedback[] {
  const out: ClientFeedback[] = [];
  for (const e of influ.entregas) {
    const a = entregaAjusteView(e);
    if (!a) continue;
    out.push({
      key: e.id,
      entregaId: e.id,
      entregaNome: entregaNome(e),
      etapaLabel: a.etapaLabel,
      motivo: a.veredito.motivo,
      respondedAt: a.veredito.respondedAt,
      autorNome: a.veredito.autorNome,
      phase: a.phase,
      statusLabel:
        a.phase === "reenviado" ? "Reenviado · aguardando aprovação" : "Aguardando novo envio",
    });
  }
  if (influ.status === "RECUSADO" && influ.clienteReprovacao) {
    out.push({
      key: "influ",
      etapaLabel: "Seleção",
      motivo: influ.clienteReprovacao.motivo,
      respondedAt: influ.clienteReprovacao.respondedAt,
      autorNome: influ.clienteReprovacao.autorNome,
      statusLabel: "Não aprovado pelo cliente",
    });
  }
  return out
    .filter((f) => f.motivo.trim() !== "")
    .sort((a, b) => b.respondedAt.localeCompare(a.respondedAt));
}
