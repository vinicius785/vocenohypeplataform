import type { ClienteVeredito, Entrega, EntregaAnexoCategoria } from "@/lib/influencer-model";
import { ENTREGA_STAGE_LABEL } from "@/lib/campanha-status";
import type { EntregaEngineActionKind } from "@/lib/entrega-engine";

/**
 * Camada de APRESENTAÇÃO do ciclo de ajustes de uma entrega — não muda a máquina de estados
 * (`entrega-engine.ts` / `campanha-status.ts`). Ela só lê `stage` + o carimbo do feedback do cliente
 * (`roteiroReprovacao`/`conteudoReprovacao`, que só some quando o cliente aprova) para dizer em qual
 * ponto do ciclo a entrega está:
 *
 *   Aguardando aprovação → Ajustes solicitados (stage *_AJUSTES)
 *     → Em ajustes (equipe reconheceu: stage volta a ROTEIRO_PRODUCAO/PRODUCAO, feedback ainda marcado)
 *     → Reenviado para aprovação (stage *_APROVACAO com o feedback anterior ainda marcado)
 *     → Aprovado (o feedback é limpo pelo cliente).
 */
export type AjustePhase = "solicitados" | "em_ajustes" | "reenviado";
export type AjusteEtapa = "roteiro" | "conteudo";

export const AJUSTE_PHASE_LABEL: Record<AjustePhase, string> = {
  solicitados: "Ajustes solicitados",
  em_ajustes: "Em ajustes",
  // Depois do reenvio o status volta a ser o de sempre (“Aguardando aprovação”); o aviso de que foi
  // reenviado é uma mensagem pequena à parte (`reenviadoMessage`), nunca o status principal.
  reenviado: "Aguardando aprovação",
};

export type AjusteView = {
  phase: AjustePhase;
  etapa: AjusteEtapa;
  etapaLabel: "Roteiro" | "Conteúdo";
  categoria: EntregaAnexoCategoria;
  veredito: ClienteVeredito;
};

type AjusteFields = Pick<Entrega, "stage" | "roteiroReprovacao" | "conteudoReprovacao">;

export function entregaAjusteView(e: AjusteFields): AjusteView | null {
  const roteiro = (phase: AjustePhase, v: ClienteVeredito): AjusteView => ({
    phase,
    etapa: "roteiro",
    etapaLabel: "Roteiro",
    categoria: "Roteiro",
    veredito: v,
  });
  const conteudo = (phase: AjustePhase, v: ClienteVeredito): AjusteView => ({
    phase,
    etapa: "conteudo",
    etapaLabel: "Conteúdo",
    categoria: "Conteúdo final",
    veredito: v,
  });
  const r = e.roteiroReprovacao;
  const c = e.conteudoReprovacao;
  if (e.stage === "ROTEIRO_AJUSTES" && r) return roteiro("solicitados", r);
  if (e.stage === "ROTEIRO_PRODUCAO" && r) return roteiro("em_ajustes", r);
  if (e.stage === "ROTEIRO_APROVACAO" && r) return roteiro("reenviado", r);
  if (e.stage === "CONTEUDO_AJUSTES" && c) return conteudo("solicitados", c);
  if (e.stage === "PRODUCAO" && c) return conteudo("em_ajustes", c);
  if (e.stage === "CONTEUDO_APROVACAO" && c) return conteudo("reenviado", c);
  return null;
}

/** Rótulo do status da entrega: no ciclo de ajustes usa o do ciclo; senão, o do motor. */
export function entregaStatusLabel(e: AjusteFields): string {
  const a = entregaAjusteView(e);
  return a ? AJUSTE_PHASE_LABEL[a.phase] : ENTREGA_STAGE_LABEL[e.stage ?? "ROTEIRO_PRODUCAO"];
}

export type AjusteNextStep = {
  label: string;
  /** Ação do motor que este botão executa (a mesma de `deriveEntregaNextStep`). */
  action: EntregaEngineActionKind;
  /** "editar" = reconhece o ajuste e leva ao arquivo; "reenviar" = manda de novo ao cliente. */
  kind: "editar" | "reenviar";
  /** O que acontece depois que a pessoa conclui este passo. */
  afterText: string;
};

/** Próximo passo do ciclo de ajustes (ou `null` quando não há nada a fazer — ex.: reenviado).
 * `engineAction` é o que o motor já considera válido agora; só é usado se bater com o passo. */
export function ajusteNextStep(
  a: AjusteView,
  engineAction: EntregaEngineActionKind | null,
): AjusteNextStep | null {
  const nome = a.etapa === "roteiro" ? "roteiro" : "conteúdo final";
  if (a.phase === "solicitados") {
    const action =
      a.etapa === "roteiro" ? "reconhecer_ajustes_roteiro" : "reconhecer_ajustes_conteudo";
    if (engineAction !== action) return null;
    return {
      label: `Editar ${nome}`,
      action,
      kind: "editar",
      afterText: `Ao começar, a entrega passa para “Em ajustes”. Depois é só anexar a nova versão do ${nome} e reenviar.`,
    };
  }
  if (a.phase === "em_ajustes") {
    const action = a.etapa === "roteiro" ? "enviar_roteiro" : "enviar_conteudo";
    if (engineAction !== action) return null;
    return {
      label: "Enviar novamente para aprovação",
      action,
      kind: "reenviar",
      afterText: "A entrega volta para “Aguardando aprovação” do cliente.",
    };
  }
  return null;
}

/** Já existe um arquivo da categoria anexado DEPOIS do feedback do cliente? Usa o instante exato
 * (`criadoEmTs`) quando existe; em anexo antigo (só o dia, `criadoEm`) só conta um dia POSTERIOR ao do
 * feedback — nunca arrisca dizer "atualizado" para um arquivo que pode ser o antigo. */
export function anexoAtualizadoDesde(
  e: Pick<Entrega, "anexos">,
  categoria: EntregaAnexoCategoria,
  desdeISO: string,
): boolean {
  const since = Date.parse(desdeISO);
  if (Number.isNaN(since)) return true;
  const sinceDay = new Date(since);
  const dayKey = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return (e.anexos ?? []).some((x) => {
    if (x.categoria !== categoria) return false;
    if (x.criadoEmTs) return Date.parse(x.criadoEmTs) > since;
    if (!x.criadoEm) return false;
    const [y, m, d] = x.criadoEm.split("-").map(Number);
    return y * 10000 + m * 100 + d > dayKey(sinceDay);
  });
}

/** "hoje às 16:04", "ontem às 09:30" ou "05/10 às 16:04". */
export function formatFeedbackWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  const hhmm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const dayKey = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return `hoje às ${hhmm}`;
  if (dayKey(d) === dayKey(yesterday)) return `ontem às ${hhmm}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${hhmm}`;
}

/** Resumo curto do feedback para o detalhe; o texto completo abre em "Ver feedback completo". */
export function feedbackExcerpt(motivo: string, max = 200): { text: string; truncated: boolean } {
  const clean = motivo.trim();
  if (clean.length <= max) return { text: clean, truncated: false };
  return { text: `${clean.slice(0, max).trimEnd()}…`, truncated: true };
}

/** Texto do histórico sem repetir o feedback inteiro (ele já está em "Feedback do cliente"):
 * "solicitou ajustes em o roteiro de uma entrega — <motivo>" → "solicitou ajustes no roteiro". */
export function historyActionText(action: string): string {
  const m = action.match(/^solicitou ajustes em (o roteiro|o conteúdo)\b.*?\s—\s[\s\S]*$/);
  if (m) return `solicitou ajustes ${m[1] === "o roteiro" ? "no roteiro" : "no conteúdo"}`;
  return action;
}

/** Mensagem pequena exibida depois do reenvio. */
export function reenviadoMessage(a: Pick<AjusteView, "etapa">): string {
  return `${a.etapa === "roteiro" ? "Roteiro" : "Conteúdo"} reenviado para aprovação do cliente.`;
}

/** Os 3 momentos do ciclo, na ordem em que a história se conta. */
export const AJUSTE_TRAIL: AjustePhase[] = ["solicitados", "em_ajustes", "reenviado"];
