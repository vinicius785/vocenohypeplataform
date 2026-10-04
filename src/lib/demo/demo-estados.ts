import type { EntregaStage, InfluStatus } from "@/lib/campanha-status";
import { DemoError } from "./demo-types";

/**
 * Tabela de transições da Demo — MAPEADA nas máquinas de estado que já existem
 * (`campanha-status.ts`, `campanha-aprovacao.ts`, `entrega-engine.ts`). A Demo NÃO cria
 * estados nem regras: este arquivo só dá nome (na linguagem do pedido) ao que o produto já
 * faz, e `demo-estados.test.ts` executa as funções reais para provar que a tabela não
 * diverge delas.
 *
 * Decisão D2: não existe "selecionar substituto" como ação própria. Substituir um
 * influenciador recusado é o fluxo atual: o time envia OUTRO da curadoria ao cliente
 * (`EM_CURADORIA → ENVIADO_AO_CLIENTE`) — por isso `replacement_selected` e `pending`
 * compartilham a mesma transição.
 */

export type DemoEntity = "influenciador" | "roteiro" | "conteudo";
export type DemoActor = "time" | "cliente";

/** Nomes de estado usados no pedido da Demo. */
export type DemoSpecState =
  | "pending"
  | "approved"
  | "rejected"
  | "replacement_selected"
  | "resubmitted"
  | "adjustment_requested";

/** Função do produto que realiza a transição (rastreabilidade). */
export type DemoTransitionVia =
  | "canTransitionInflu"
  | "applyInfluApproval"
  | "reopenInfluApprovalByCliente"
  | "applyEntregaAction"
  | "applyEntregaApproval";

export type DemoTransition = {
  id: string;
  entity: DemoEntity;
  actor: DemoActor;
  label: string;
  from: InfluStatus | EntregaStage;
  to: InfluStatus | EntregaStage;
  specStates: DemoSpecState[];
  via: DemoTransitionVia;
  /** Ação do motor/da aprovação, quando `via` a exige. */
  action?: string;
  /** O cliente precisa explicar o motivo (a regra já existe nas funções reais). */
  requiresReason?: boolean;
};

export const DEMO_TRANSITIONS: readonly DemoTransition[] = [
  // ---------------- Influenciador ----------------
  {
    id: "influ.enviar_ao_cliente",
    entity: "influenciador",
    actor: "time",
    label: "Enviar perfil ao cliente",
    from: "EM_CURADORIA",
    to: "ENVIADO_AO_CLIENTE",
    specStates: ["pending", "replacement_selected"],
    via: "canTransitionInflu",
  },
  {
    id: "influ.aprovar",
    entity: "influenciador",
    actor: "cliente",
    label: "Aprovar perfil",
    from: "ENVIADO_AO_CLIENTE",
    to: "APROVADO",
    specStates: ["approved"],
    via: "applyInfluApproval",
    action: "aprovado",
  },
  {
    id: "influ.reprovar",
    entity: "influenciador",
    actor: "cliente",
    label: "Não aprovar perfil",
    from: "ENVIADO_AO_CLIENTE",
    to: "RECUSADO",
    specStates: ["rejected"],
    via: "applyInfluApproval",
    action: "reprovado",
    requiresReason: true,
  },
  {
    id: "influ.reenviar",
    entity: "influenciador",
    actor: "time",
    label: "Reenviar perfil ao cliente",
    from: "RECUSADO",
    to: "ENVIADO_AO_CLIENTE",
    specStates: ["resubmitted"],
    via: "canTransitionInflu",
  },
  {
    id: "influ.reabrir_decisao",
    entity: "influenciador",
    actor: "cliente",
    label: "Reabrir decisão",
    from: "APROVADO",
    to: "ENVIADO_AO_CLIENTE",
    specStates: ["pending"],
    via: "reopenInfluApprovalByCliente",
  },

  // ---------------- Roteiro ----------------
  {
    id: "roteiro.enviar",
    entity: "roteiro",
    actor: "time",
    label: "Enviar roteiro ao cliente",
    from: "ROTEIRO_PRODUCAO",
    to: "ROTEIRO_APROVACAO",
    specStates: ["pending", "resubmitted"],
    via: "applyEntregaAction",
    action: "enviar_roteiro",
  },
  {
    id: "roteiro.aprovar",
    entity: "roteiro",
    actor: "cliente",
    label: "Aprovar roteiro",
    from: "ROTEIRO_APROVACAO",
    to: "PRODUCAO",
    specStates: ["approved"],
    via: "applyEntregaApproval",
    action: "aprovado",
  },
  {
    id: "roteiro.pedir_ajuste",
    entity: "roteiro",
    actor: "cliente",
    label: "Solicitar ajuste no roteiro",
    from: "ROTEIRO_APROVACAO",
    to: "ROTEIRO_AJUSTES",
    specStates: ["adjustment_requested"],
    via: "applyEntregaApproval",
    action: "reprovado",
    requiresReason: true,
  },
  {
    id: "roteiro.reconhecer_ajuste",
    entity: "roteiro",
    actor: "time",
    label: "Ver feedback do roteiro",
    from: "ROTEIRO_AJUSTES",
    to: "ROTEIRO_PRODUCAO",
    specStates: [],
    via: "applyEntregaAction",
    action: "reconhecer_ajustes_roteiro",
  },

  // ---------------- Conteúdo ----------------
  {
    id: "conteudo.enviar",
    entity: "conteudo",
    actor: "time",
    label: "Enviar conteúdo final ao cliente",
    from: "PRODUCAO",
    to: "CONTEUDO_APROVACAO",
    specStates: ["pending", "resubmitted"],
    via: "applyEntregaAction",
    action: "enviar_conteudo",
  },
  {
    id: "conteudo.aprovar",
    entity: "conteudo",
    actor: "cliente",
    label: "Aprovar conteúdo",
    from: "CONTEUDO_APROVACAO",
    to: "PUBLICACAO",
    specStates: ["approved"],
    via: "applyEntregaApproval",
    action: "aprovado",
  },
  {
    id: "conteudo.pedir_ajuste",
    entity: "conteudo",
    actor: "cliente",
    label: "Solicitar ajuste no conteúdo",
    from: "CONTEUDO_APROVACAO",
    to: "CONTEUDO_AJUSTES",
    specStates: ["adjustment_requested"],
    via: "applyEntregaApproval",
    action: "reprovado",
    requiresReason: true,
  },
  {
    id: "conteudo.reconhecer_ajuste",
    entity: "conteudo",
    actor: "time",
    label: "Ver feedback do conteúdo final",
    from: "CONTEUDO_AJUSTES",
    to: "PRODUCAO",
    specStates: [],
    via: "applyEntregaAction",
    action: "reconhecer_ajustes_conteudo",
  },
  {
    id: "conteudo.marcar_publicado",
    entity: "conteudo",
    actor: "time",
    label: "Marcar como publicado",
    from: "PUBLICACAO",
    to: "PUBLICADA",
    specStates: [],
    via: "applyEntregaAction",
    action: "marcar_publicado",
  },
] as const;

/** Transições disponíveis para `actor` a partir do estado atual de `entity`. */
export function availableDemoTransitions(
  entity: DemoEntity,
  actor: DemoActor,
  from: InfluStatus | EntregaStage,
): DemoTransition[] {
  return DEMO_TRANSITIONS.filter(
    (t) => t.entity === entity && t.actor === actor && t.from === from,
  );
}

export function findDemoTransition(id: string): DemoTransition | undefined {
  return DEMO_TRANSITIONS.find((t) => t.id === id);
}

/**
 * Guarda de STATUS do influenciador na resposta do cliente. As funções reais
 * (`applyInfluApproval`) não conferem o status de origem; no portal por sessão a tela só
 * oferece os botões em `ENVIADO_AO_CLIENTE`. Na Demo o servidor confere de verdade —
 * quem chamar a função pública direto não aprova um influenciador que ainda está na
 * curadoria.
 */
export function canClienteRespondInflu(status: InfluStatus): boolean {
  return status === "ENVIADO_AO_CLIENTE";
}

export function assertClienteCanRespondInflu(status: InfluStatus): void {
  if (!canClienteRespondInflu(status)) {
    throw new DemoError("invalid_state", "Este perfil não está aguardando a decisão do cliente.");
  }
}
