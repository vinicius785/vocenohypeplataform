import type { Influ, Entrega, ClienteVeredito } from "@/components/influenciadores/InfluencerBoard";

/**
 * Transições de estado disparadas pelo cliente através do link público da
 * campanha (`/campanha/$token`) — funil de 4 etapas: seleção do influ,
 * roteiro, conteúdo e (fora daqui) métricas pós-postagem. Extraído como
 * funções puras pra ser usado tanto pelo board interno quanto pelas server
 * functions públicas (`campanha-link.functions.ts`), sem duplicar a regra
 * de qual status vira qual.
 */

function clientActivity(action: string, entregaId?: string) {
  return {
    id: crypto.randomUUID(),
    author: "Cliente",
    initials: "CL",
    color: "bg-slate-500 text-white",
    action,
    entregaId,
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
): Influ {
  const at = new Date().toISOString();
  const entrega = influ.entregas.find((e) => e.id === entregaId);
  if (!entrega) throw new Error("Entrega não encontrada.");
  if (entrega.stage !== "ROTEIRO_APROVACAO" && entrega.stage !== "CONTEUDO_APROVACAO") {
    throw new Error("Esta entrega não está aguardando aprovação do cliente no momento.");
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
            roteiroReprovacao: stamp(motivo ?? ""),
          };
    }
    return status === "aprovado"
      ? { ...e, stage: "PUBLICACAO", conteudoReprovacao: undefined }
      : {
          ...e,
          stage: "CONTEUDO_AJUSTES",
          dataRecebimentoConteudo: undefined,
          conteudoReprovacao: stamp(motivo ?? ""),
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
    activity: [...(influ.activity ?? []), clientActivity(action, entregaId)],
    updatedAt: at,
  };
}

/** Perfil enviado ao cliente, aguardando a resposta dele. */
export function influApprovalPending(influ: Influ): boolean {
  return influ.status === "ENVIADO_AO_CLIENTE";
}
