import type { Influ, Entrega, ClienteVeredito } from "@/components/influenciadores/InfluencerBoard";
import { INFLU_STATUSES } from "@/components/influenciadores/InfluencerBoard";

/**
 * Transições de estado disparadas pelo cliente através do link público da
 * campanha (`/campanha/$token`) — funil de 4 etapas: seleção do influ,
 * roteiro, conteúdo e (fora daqui) métricas pós-postagem. Extraído como
 * funções puras pra ser usado tanto pelo board interno quanto pelas server
 * functions públicas (`campanha-link.functions.ts`), sem duplicar a regra
 * de qual status vira qual.
 */

function clientActivity(action: string) {
  return {
    id: crypto.randomUUID(),
    author: "Cliente",
    initials: "CL",
    color: "bg-slate-500 text-white",
    action,
    createdAt: new Date().toISOString(),
  };
}

function stamp(motivo?: string): ClienteVeredito | undefined {
  return motivo !== undefined ? { motivo, respondedAt: new Date().toISOString() } : undefined;
}

/** Etapa 1 — aprovar/reprovar a seleção do influenciador pra campanha. */
export function applyInfluApproval(
  influ: Influ,
  status: "aprovado" | "reprovado",
  motivo?: string,
): Influ {
  const at = new Date().toISOString();
  if (status === "aprovado") {
    return {
      ...influ,
      status: "Aprovado",
      clienteReprovacao: undefined,
      lastClientAction: { kind: "influ", status: "aprovado", at },
      activity: [...(influ.activity ?? []), clientActivity("aprovou a seleção pra campanha")],
      updatedAt: at,
    };
  }
  return {
    ...influ,
    clienteReprovacao: stamp(motivo ?? ""),
    lastClientAction: { kind: "influ", status: "reprovado", at },
    activity: [
      ...(influ.activity ?? []),
      clientActivity(`reprovou a seleção pra campanha — ${motivo ?? "sem motivo"}`),
    ],
    updatedAt: at,
  };
}

/** Etapas 2 e 3 — aprovar/reprovar o roteiro ou o conteúdo de uma entrega. */
export function applyEntregaApproval(
  influ: Influ,
  entregaId: string,
  kind: "roteiro" | "conteudo",
  status: "aprovado" | "reprovado",
  motivo?: string,
): Influ {
  const at = new Date().toISOString();
  const entregas = influ.entregas.map((e): Entrega => {
    if (e.id !== entregaId) return e;
    if (kind === "roteiro") {
      return status === "aprovado"
        ? { ...e, conteudoStatus: "Roteiro aprovado", roteiroReprovacao: undefined }
        : { ...e, conteudoStatus: "Aguardando roteiro", roteiroReprovacao: stamp(motivo ?? "") };
    }
    return status === "aprovado"
      ? { ...e, conteudoStatus: "Conteúdo aprovado", conteudoReprovacao: undefined }
      : { ...e, conteudoStatus: "Em gravação", conteudoReprovacao: stamp(motivo ?? "") };
  });
  const label = kind === "roteiro" ? "o roteiro" : "o conteúdo";
  const action =
    status === "aprovado"
      ? `aprovou ${label} de uma entrega`
      : `reprovou ${label} de uma entrega — ${motivo ?? "sem motivo"}`;
  return {
    ...influ,
    entregas,
    lastClientAction: { kind, entregaId, status, at },
    activity: [...(influ.activity ?? []), clientActivity(action)],
    updatedAt: at,
  };
}

/** Índice do status do influ na esteira interna — usado pra saber se a
 * seleção já passou da etapa "aguardando aprovação do cliente". */
export function influApprovalPending(influ: Influ): boolean {
  return influ.status === "Enviado para aprovação";
}
