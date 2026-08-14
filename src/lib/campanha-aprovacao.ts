import type { Influ, Entrega, ClienteVeredito } from "@/components/influenciadores/InfluencerBoard";

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

/** Etapa 1 — aprovar/reprovar a seleção do influenciador pra campanha.
 * Reprovar agora move o status pra RECUSADO de verdade (não só uma flag
 * ao lado) — `clienteReprovacao` continua guardando o motivo. */
export function applyInfluApproval(
  influ: Influ,
  status: "aprovado" | "reprovado",
  motivo?: string,
): Influ {
  const at = new Date().toISOString();
  if (status === "aprovado") {
    return {
      ...influ,
      status: "APROVADO",
      clienteReprovacao: undefined,
      lastClientAction: { kind: "influ", status: "aprovado", at },
      activity: [...(influ.activity ?? []), clientActivity("aprovou a seleção pra campanha")],
      updatedAt: at,
    };
  }
  return {
    ...influ,
    status: "RECUSADO",
    clienteReprovacao: stamp(motivo ?? ""),
    lastClientAction: { kind: "influ", status: "reprovado", at },
    activity: [
      ...(influ.activity ?? []),
      clientActivity(`reprovou a seleção pra campanha — ${motivo ?? "sem motivo"}`),
    ],
    updatedAt: at,
  };
}

/** Etapas 2 e 3 — aprovar/reprovar o roteiro ou o conteúdo de uma entrega.
 * "Ajustes solicitados" volta a entrega pra EM_PRODUCAO automaticamente —
 * não fica parada esperando outra ação além do time refazer e reenviar. */
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
        ? { ...e, conteudoStatus: "APROVADA", etapa: "roteiro", roteiroReprovacao: undefined }
        : {
            ...e,
            conteudoStatus: "EM_PRODUCAO",
            etapa: "roteiro",
            roteiroReprovacao: stamp(motivo ?? ""),
          };
    }
    return status === "aprovado"
      ? { ...e, conteudoStatus: "APROVADA", etapa: "conteudo", conteudoReprovacao: undefined }
      : {
          ...e,
          conteudoStatus: "EM_PRODUCAO",
          etapa: "conteudo",
          conteudoReprovacao: stamp(motivo ?? ""),
        };
  });
  const label = kind === "roteiro" ? "o roteiro" : "o conteúdo";
  const action =
    status === "aprovado"
      ? `aprovou ${label} de uma entrega`
      : `solicitou ajustes em ${label} de uma entrega — ${motivo ?? "sem motivo"}`;
  return {
    ...influ,
    entregas,
    lastClientAction: { kind, entregaId, status, at },
    activity: [...(influ.activity ?? []), clientActivity(action)],
    updatedAt: at,
  };
}

/** Perfil enviado ao cliente, aguardando a resposta dele. */
export function influApprovalPending(influ: Influ): boolean {
  return influ.status === "ENVIADO_AO_CLIENTE";
}
