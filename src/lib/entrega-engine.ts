import type { Entrega } from "@/components/influenciadores/InfluencerBoard";
import {
  nextActionForEntrega,
  legacyEntregaEtapa,
  type EntregaStatus,
  type EntregaEtapa,
  type NextActor,
} from "@/lib/campanha-status";

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Motor de próxima ação da entrega — ÚNICA fonte de verdade pra status
 * exibido, etapa, responsável e o botão de ação disponível. Nenhum
 * componente de UI decide isso na mão: sempre lê `deriveEntregaNextStep` e
 * sempre escreve através de `applyEntregaAction`.
 *
 * Prontidão de cada etapa (roteiro/conteúdo) NUNCA é inferida de
 * `anexos.some(...)` — só dos carimbos explícitos (`dataRecebimentoRoteiro`,
 * `dataGravacaoConcluida`, `dataRecebimentoConteudo`), setados só quando o
 * time confirma a ação, nunca automaticamente a partir de um upload solto.
 *
 * Etapa "gravação" é 100% interna — nunca vai pro cliente (não existe
 * `kind: "gravacao"` em `applyEntregaApproval`), avança sozinha ao ser
 * marcada concluída.
 */

export const ENTREGA_STATUS_LABEL_SIMPLES: Record<EntregaStatus, string> = {
  COMBINADA: "Combinada",
  EM_PRODUCAO: "Em produção",
  AGUARDANDO_APROVACAO: "Aguardando cliente",
  AJUSTES_SOLICITADOS: "Ajustes solicitados",
  APROVADA: "Aprovado",
  PUBLICADA: "Concluída",
};

export type EntregaEngineActionKind =
  | "iniciar_producao"
  | "marcar_roteiro_pronto"
  | "marcar_gravacao_concluida"
  | "marcar_conteudo_pronto"
  | "enviar_cliente"
  | "reconhecer_ajustes"
  | "marcar_publicado";

export type EntregaNextStep = {
  statusLabel: string;
  etapaAtual: EntregaEtapa;
  responsavel: NextActor;
  actionLabel: string | null;
  action: EntregaEngineActionKind | null;
};

/** Leitura pura — nunca muta nada. */
export function deriveEntregaNextStep(entrega: Entrega): EntregaNextStep {
  const status: EntregaStatus = entrega.conteudoStatus ?? "COMBINADA";
  const etapaAtual = legacyEntregaEtapa(entrega.etapa);
  const statusLabel = ENTREGA_STATUS_LABEL_SIMPLES[status];
  const responsavel = nextActionForEntrega(status);

  const step = (
    actionLabel: string | null,
    action: EntregaEngineActionKind | null,
  ): EntregaNextStep => ({
    statusLabel,
    etapaAtual,
    responsavel,
    actionLabel,
    action,
  });

  switch (status) {
    case "COMBINADA":
      return step("Iniciar produção", "iniciar_producao");

    case "EM_PRODUCAO":
      if (etapaAtual === "roteiro") {
        return entrega.dataRecebimentoRoteiro
          ? step("Enviar para cliente", "enviar_cliente")
          : step("Adicionar roteiro", "marcar_roteiro_pronto");
      }
      if (etapaAtual === "gravacao") {
        return step("Marcar gravação concluída", "marcar_gravacao_concluida");
      }
      // conteudo (ou publicacao, por segurança — não deveria ocorrer com
      // EM_PRODUCAO, mas cai no mesmo tratamento de conteúdo)
      return entrega.dataRecebimentoConteudo
        ? step("Enviar para cliente", "enviar_cliente")
        : step("Adicionar conteúdo final", "marcar_conteudo_pronto");

    case "AGUARDANDO_APROVACAO":
      return step(null, null);

    case "AJUSTES_SOLICITADOS":
      return step("Ver feedback", "reconhecer_ajustes");

    case "APROVADA":
      return step("Marcar como publicado", "marcar_publicado");

    case "PUBLICADA":
      return step(null, null);
  }
}

/** Escrita pura — o único lugar que decide o patch de uma transição de
 * entrega. Valida a origem esperada e lança erro se chamado fora de ordem
 * (a UI só deve chamar com o `action` que `deriveEntregaNextStep` já
 * disse ser válido — nunca monta o patch na mão). */
export function applyEntregaAction(
  entrega: Entrega,
  actionKind: EntregaEngineActionKind,
  opts: { url?: string } = {},
): Partial<Entrega> {
  const status: EntregaStatus = entrega.conteudoStatus ?? "COMBINADA";
  const etapaAtual = legacyEntregaEtapa(entrega.etapa);
  const today = todayISO();

  const assert = (condition: boolean) => {
    if (!condition) {
      throw new Error(
        `Ação "${actionKind}" inválida pro estado atual (status=${status}, etapa=${etapaAtual}).`,
      );
    }
  };

  switch (actionKind) {
    case "iniciar_producao":
      assert(status === "COMBINADA");
      return { conteudoStatus: "EM_PRODUCAO", etapa: "roteiro" };

    case "marcar_roteiro_pronto":
      assert(status === "EM_PRODUCAO" && etapaAtual === "roteiro");
      return { dataRecebimentoRoteiro: today };

    case "marcar_gravacao_concluida":
      assert(status === "EM_PRODUCAO" && etapaAtual === "gravacao");
      return { dataGravacaoConcluida: today, etapa: "conteudo" };

    case "marcar_conteudo_pronto":
      assert(status === "EM_PRODUCAO" && etapaAtual === "conteudo");
      return { dataRecebimentoConteudo: today };

    case "enviar_cliente":
      assert(status === "EM_PRODUCAO");
      return { conteudoStatus: "AGUARDANDO_APROVACAO" };

    case "reconhecer_ajustes":
      assert(status === "AJUSTES_SOLICITADOS");
      return { conteudoStatus: "EM_PRODUCAO" };

    case "marcar_publicado":
      assert(status === "APROVADA");
      return {
        conteudoStatus: "PUBLICADA",
        status: "publicado",
        publicadoEm: today,
        url: opts.url ?? entrega.url,
      };
  }
}
