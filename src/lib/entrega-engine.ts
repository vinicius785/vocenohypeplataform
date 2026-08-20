import type { Entrega, EntregaAnexoCategoria } from "@/components/influenciadores/InfluencerBoard";
import {
  nextActionForEntrega,
  ENTREGA_STAGE_LABEL,
  type EntregaStage,
  type NextActor,
} from "@/lib/campanha-status";

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Motor de próxima ação da entrega — ÚNICA fonte de verdade pra estágio
 * exibido, responsável e o botão de ação disponível. Nenhum componente de
 * UI decide isso na mão: sempre lê `deriveEntregaNextStep` e sempre
 * escreve através de `applyEntregaAction`.
 *
 * Prontidão de cada etapa (roteiro/conteúdo) é derivada de existir um
 * anexo de verdade na categoria correspondente (`hasAnexoCategoria`) — não
 * do carimbo de data (`dataRecebimentoRoteiro`/`dataRecebimentoConteudo`),
 * que também é editável à mão na seção Prazos e por isso não pode ser a
 * trava de "já anexou". Sem isso, dava pra digitar uma data ali e liberar
 * "Enviar roteiro" sem nunca ter subido arquivo nenhum.
 */

function hasAnexoCategoria(entrega: Entrega, categoria: EntregaAnexoCategoria): boolean {
  return (entrega.anexos ?? []).some((a) => a.categoria === categoria);
}

export type EntregaEngineActionKind =
  | "anexar_roteiro"
  | "enviar_roteiro"
  | "reconhecer_ajustes_roteiro"
  | "anexar_conteudo"
  | "enviar_conteudo"
  | "reconhecer_ajustes_conteudo"
  | "marcar_publicado";

export type EntregaNextStep = {
  stageLabel: string;
  stage: EntregaStage;
  responsavel: NextActor;
  actionLabel: string | null;
  action: EntregaEngineActionKind | null;
};

/** Leitura pura — nunca muta nada. */
export function deriveEntregaNextStep(entrega: Entrega): EntregaNextStep {
  const stage: EntregaStage = entrega.stage ?? "ROTEIRO_PRODUCAO";
  const stageLabel = ENTREGA_STAGE_LABEL[stage];
  const responsavel = nextActionForEntrega(stage);

  const step = (
    actionLabel: string | null,
    action: EntregaEngineActionKind | null,
  ): EntregaNextStep => ({
    stageLabel,
    stage,
    responsavel,
    actionLabel,
    action,
  });

  switch (stage) {
    case "ROTEIRO_PRODUCAO":
      return hasAnexoCategoria(entrega, "Roteiro")
        ? step("Enviar roteiro para o cliente", "enviar_roteiro")
        : step("Adicionar roteiro", "anexar_roteiro");

    case "ROTEIRO_APROVACAO":
      return step(null, null);

    case "ROTEIRO_AJUSTES":
      return step("Ver feedback do roteiro", "reconhecer_ajustes_roteiro");

    case "PRODUCAO":
      return hasAnexoCategoria(entrega, "Conteúdo final")
        ? step("Enviar conteúdo final para o cliente", "enviar_conteudo")
        : step("Adicionar conteúdo final", "anexar_conteudo");

    case "CONTEUDO_APROVACAO":
      return step(null, null);

    case "CONTEUDO_AJUSTES":
      return step("Ver feedback do conteúdo final", "reconhecer_ajustes_conteudo");

    case "PUBLICACAO":
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
  const stage: EntregaStage = entrega.stage ?? "ROTEIRO_PRODUCAO";
  const today = todayISO();

  const assert = (condition: boolean) => {
    if (!condition) {
      throw new Error(`Ação "${actionKind}" inválida pro estágio atual (stage=${stage}).`);
    }
  };

  switch (actionKind) {
    case "anexar_roteiro":
      assert(stage === "ROTEIRO_PRODUCAO");
      return { dataRecebimentoRoteiro: today };

    case "enviar_roteiro":
      assert(stage === "ROTEIRO_PRODUCAO" && hasAnexoCategoria(entrega, "Roteiro"));
      return { stage: "ROTEIRO_APROVACAO" };

    case "reconhecer_ajustes_roteiro":
      assert(stage === "ROTEIRO_AJUSTES");
      return { stage: "ROTEIRO_PRODUCAO" };

    case "anexar_conteudo":
      assert(stage === "PRODUCAO");
      return { dataRecebimentoConteudo: today };

    case "enviar_conteudo":
      assert(stage === "PRODUCAO" && hasAnexoCategoria(entrega, "Conteúdo final"));
      return { stage: "CONTEUDO_APROVACAO" };

    case "reconhecer_ajustes_conteudo":
      assert(stage === "CONTEUDO_AJUSTES");
      return { stage: "PRODUCAO" };

    case "marcar_publicado":
      assert(stage === "PUBLICACAO");
      return {
        stage: "PUBLICADA",
        status: "publicado",
        publicadoEm: today,
        url: opts.url ?? entrega.url,
      };
  }
}
