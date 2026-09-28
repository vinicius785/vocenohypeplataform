import type {
  Influ,
  Entrega,
  ClienteVeredito,
  InfluActivityEvent,
} from "@/components/influenciadores/InfluencerBoard";
import { canReopenInfluApproval } from "@/lib/campanha-status";

/**
 * Transições de estado disparadas pelo cliente através do link público da
 * campanha (`/campanha/$token`) — funil de 4 etapas: seleção do influ,
 * roteiro, conteúdo e (fora daqui) métricas pós-postagem. Extraído como
 * funções puras pra ser usado tanto pelo board interno quanto pelas server
 * functions públicas (`campanha-link.functions.ts`), sem duplicar a regra
 * de qual status vira qual.
 */

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CL";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Nome real do cliente que agiu, quando disponível — só o Portal V2
 * (sessão autenticada) consegue fornecer um (via `user_metadata.full_name`
 * do usuário logado). O link público antigo (V1, sem login individual)
 * passa `undefined`, e o rótulo genérico "Cliente" é usado — nunca um nome
 * inventado nem uma suposição de quem foi. */
function clientActivity(action: string, entregaId?: string, actorName?: string) {
  const name = actorName?.trim() || "Cliente";
  return {
    id: crypto.randomUUID(),
    author: name,
    initials: initialsFor(name),
    color: "bg-slate-500 text-white",
    action,
    entregaId,
    createdAt: new Date().toISOString(),
  };
}

/** Grava um evento tipado (decisão 1 — ver comentário em `InfluActivityEvent`
 * no InfluencerBoard). Ver `clientActivity` sobre `actorName`. */
function clientActivityEvent(
  kind: InfluActivityEvent["kind"],
  fields: Partial<InfluActivityEvent> = {},
  actorName?: string,
): InfluActivityEvent {
  const name = actorName?.trim() || "Cliente";
  return {
    id: crypto.randomUUID(),
    kind,
    actor: { type: "cliente", name, initials: initialsFor(name), color: "bg-slate-500 text-white" },
    createdAt: new Date().toISOString(),
    ...fields,
  };
}

function stamp(motivo?: string, actorName?: string): ClienteVeredito | undefined {
  return motivo !== undefined
    ? { motivo, respondedAt: new Date().toISOString(), autorNome: actorName?.trim() || undefined }
    : undefined;
}

/** Etapa 1 — aprovar/reprovar a seleção do influenciador pra campanha.
 * Reprovar agora move o status pra RECUSADO de verdade (não só uma flag
 * ao lado) — `clienteReprovacao` continua guardando o motivo. */
export function applyInfluApproval(
  influ: Influ,
  status: "aprovado" | "reprovado",
  motivo?: string,
  extra: { motivoLabel?: string; comentario?: string; actorName?: string } = {},
): Influ {
  const at = new Date().toISOString();
  const statusAnterior = influ.status;
  if (status === "aprovado") {
    return {
      ...influ,
      status: "APROVADO",
      clienteReprovacao: undefined,
      lastClientAction: { kind: "influ", status: "aprovado", at },
      activity: [
        ...(influ.activity ?? []),
        clientActivity("aprovou a seleção pra campanha", undefined, extra.actorName),
      ],
      activityEvents: [
        ...(influ.activityEvents ?? []),
        clientActivityEvent(
          "perfil_aprovado",
          { statusAnterior, statusNovo: "APROVADO" },
          extra.actorName,
        ),
      ],
      updatedAt: at,
    };
  }
  return {
    ...influ,
    status: "RECUSADO",
    clienteReprovacao: stamp(motivo ?? "", extra.actorName),
    lastClientAction: { kind: "influ", status: "reprovado", at },
    activity: [
      ...(influ.activity ?? []),
      clientActivity(
        `reprovou a seleção pra campanha — ${motivo ?? "sem motivo"}`,
        undefined,
        extra.actorName,
      ),
    ],
    activityEvents: [
      ...(influ.activityEvents ?? []),
      clientActivityEvent(
        "perfil_recusado",
        {
          statusAnterior,
          statusNovo: "RECUSADO",
          motivo,
          motivoLabel: extra.motivoLabel,
          comentario: extra.comentario,
        },
        extra.actorName,
      ),
    ],
    updatedAt: at,
  };
}

/** "Reabrir decisão" pelo próprio cliente (nova ação do portal, decisão do
 * redesenho) — mesma transição usada pelo time (APROVADO → ENVIADO_AO_CLIENTE)
 * e a MESMA trava de `canReopenInfluApproval` (bloqueia se já há entrega
 * além de ROTEIRO_PRODUCAO), pra manter consistência entre quem reabre. */
export function reopenInfluApprovalByCliente(influ: Influ, actorName?: string): Influ {
  const guard = canReopenInfluApproval(
    influ.status,
    influ.entregas.map((e) => e.stage),
  );
  if (!guard.ok) throw new Error(guard.motivo);
  const at = new Date().toISOString();
  const statusAnterior = influ.status;
  return {
    ...influ,
    status: "ENVIADO_AO_CLIENTE",
    clienteReprovacao: undefined,
    activity: [
      ...(influ.activity ?? []),
      clientActivity("reabriu a decisão sobre a seleção", undefined, actorName),
    ],
    activityEvents: [
      ...(influ.activityEvents ?? []),
      clientActivityEvent(
        "perfil_reaberto",
        { statusAnterior, statusNovo: "ENVIADO_AO_CLIENTE" },
        actorName,
      ),
    ],
    updatedAt: at,
  };
}

/** Etapas 2 e 3 — aprovar/reprovar o roteiro ou o conteúdo final de uma
 * entrega. Qual dos dois ciclos está em jogo vem do `stage` ATUAL da
 * própria entrega (ROTEIRO_APROVACAO ou CONTEUDO_APROVACAO) — nunca de um
 * parâmetro `kind` vindo do cliente, que poderia (por bug ou má-fé)
 * divergir do estado real salvo no banco. Avança automaticamente o
 * ESTÁGIO (roteiro aprovado → produção, conteúdo aprovado → publicação —
 * nunca fica parado esperando o time trocar um campo manual). Reprovar
 * usa o estágio "_AJUSTES" de verdade (não volta direto pra produção
 * silenciosamente) e limpa o carimbo de prontidão da etapa reprovada —
 * senão o motor (`entrega-engine.ts`) acharia que já tem material pronto
 * e pularia direto pra "Enviar pro cliente" de novo, sem dar chance de
 * corrigir o arquivo primeiro. */
export function applyEntregaApproval(
  influ: Influ,
  entregaId: string,
  status: "aprovado" | "reprovado",
  motivo?: string,
  actorName?: string,
): Influ {
  const at = new Date().toISOString();
  const entrega = influ.entregas.find((e) => e.id === entregaId);
  if (!entrega) throw new Error("Entrega não encontrada.");
  if (entrega.stage !== "ROTEIRO_APROVACAO" && entrega.stage !== "CONTEUDO_APROVACAO") {
    throw new Error("Esta entrega não está aguardando aprovação do cliente no momento.");
  }
  // "Ao solicitar ajustes, exigir comentário" — validação de negócio (não só
  // no zod da server function) pra proteger quem chamar esta função direto.
  if (status === "reprovado" && !motivo?.trim()) {
    throw new Error("É necessário um comentário explicando os ajustes solicitados.");
  }
  const isRoteiro = entrega.stage === "ROTEIRO_APROVACAO";

  const entregas = influ.entregas.map((e): Entrega => {
    if (e.id !== entregaId) return e;
    if (isRoteiro) {
      return status === "aprovado"
        ? { ...e, stage: "PRODUCAO", roteiroReprovacao: undefined }
        : {
            ...e,
            stage: "ROTEIRO_AJUSTES",
            dataRecebimentoRoteiro: undefined,
            roteiroReprovacao: stamp(motivo ?? "", actorName),
          };
    }
    return status === "aprovado"
      ? { ...e, stage: "PUBLICACAO", conteudoReprovacao: undefined }
      : {
          ...e,
          stage: "CONTEUDO_AJUSTES",
          dataRecebimentoConteudo: undefined,
          conteudoReprovacao: stamp(motivo ?? "", actorName),
        };
  });
  const label = isRoteiro ? "o roteiro" : "o conteúdo";
  const action =
    status === "aprovado"
      ? `aprovou ${label} de uma entrega`
      : `solicitou ajustes em ${label} de uma entrega — ${motivo ?? "sem motivo"}`;
  return {
    ...influ,
    entregas,
    lastClientAction: {
      kind: isRoteiro ? "roteiro" : "conteudo",
      entregaId,
      status,
      at,
    },
    activity: [...(influ.activity ?? []), clientActivity(action, entregaId, actorName)],
    activityEvents: [
      ...(influ.activityEvents ?? []),
      clientActivityEvent(
        status === "aprovado"
          ? isRoteiro
            ? "roteiro_aprovado"
            : "conteudo_aprovado"
          : isRoteiro
            ? "roteiro_ajustes_solicitados"
            : "conteudo_ajustes_solicitados",
        { entregaId, comentario: motivo },
        actorName,
      ),
    ],
    updatedAt: at,
  };
}

/** Perfil enviado ao cliente, aguardando a resposta dele. */
export function influApprovalPending(influ: Influ): boolean {
  return influ.status === "ENVIADO_AO_CLIENTE";
}
