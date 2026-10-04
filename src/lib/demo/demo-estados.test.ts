import { describe, expect, it } from "vitest";
import {
  ENTREGA_STAGES,
  INFLU_STATUSES,
  canTransitionEntrega,
  canTransitionInflu,
  type EntregaStage,
  type InfluStatus,
} from "@/lib/campanha-status";
import {
  applyEntregaApproval,
  applyInfluApproval,
  reopenInfluApprovalByCliente,
} from "@/lib/campanha-aprovacao";
import { applyEntregaAction, type EntregaEngineActionKind } from "@/lib/entrega-engine";
import type { Entrega, Influ } from "@/lib/influencer-model";
import {
  DEMO_TRANSITIONS,
  assertClienteCanRespondInflu,
  availableDemoTransitions,
  canClienteRespondInflu,
  findDemoTransition,
  type DemoSpecState,
} from "./demo-estados";
import { DemoError } from "./demo-types";

function entrega(stage: EntregaStage): Entrega {
  return {
    id: "e1",
    tipo: "Reels",
    quantidade: 1,
    status: "combinado",
    stage,
    // Anexos presentes nas duas categorias para que as ações "enviar" sejam elegíveis.
    anexos: [
      { id: "a1", categoria: "Roteiro", nome: "roteiro.pdf", url: "https://x/roteiro.pdf" },
      { id: "a2", categoria: "Conteúdo final", nome: "post.png", url: "https://x/post.png" },
    ],
  };
}

function influ(status: InfluStatus, stage: EntregaStage = "ROTEIRO_PRODUCAO"): Influ {
  return {
    id: "i1",
    nome: "Influenciadora Teste",
    redes: [],
    status,
    entregas: [entrega(stage)],
  };
}

describe("tabela de transições da Demo × funções reais do produto", () => {
  it("toda transição da tabela produz exatamente o estado `to` ao executar a função real", () => {
    for (const t of DEMO_TRANSITIONS) {
      if (t.via === "canTransitionInflu") {
        expect(canTransitionInflu(t.from as InfluStatus, t.to as InfluStatus), t.id).toBe(true);
      } else if (t.via === "applyInfluApproval") {
        const next = applyInfluApproval(
          influ(t.from as InfluStatus),
          t.action as "aprovado" | "reprovado",
          t.requiresReason ? "Não combina com a marca" : undefined,
        );
        expect(next.status, t.id).toBe(t.to);
      } else if (t.via === "reopenInfluApprovalByCliente") {
        expect(reopenInfluApprovalByCliente(influ(t.from as InfluStatus)).status, t.id).toBe(t.to);
      } else if (t.via === "applyEntregaAction") {
        const patch = applyEntregaAction(
          entrega(t.from as EntregaStage),
          t.action as EntregaEngineActionKind,
        );
        expect(patch.stage, t.id).toBe(t.to);
      } else {
        const next = applyEntregaApproval(
          influ("APROVADO", t.from as EntregaStage),
          "e1",
          t.action as "aprovado" | "reprovado",
          t.requiresReason ? "Ajustar o enquadramento do produto" : undefined,
        );
        expect(next.entregas[0].stage, t.id).toBe(t.to);
      }
    }
  });

  it("toda transição de ENTREGA da tabela é permitida pela máquina de estados real", () => {
    for (const t of DEMO_TRANSITIONS.filter((x) => x.entity !== "influenciador")) {
      expect(canTransitionEntrega(t.from as EntregaStage, t.to as EntregaStage), t.id).toBe(true);
    }
  });

  it("toda transição legítima de ENTREGA tem um nome na tabela (nada fica de fora)", () => {
    const named = new Set(
      DEMO_TRANSITIONS.filter((x) => x.entity !== "influenciador").map((x) => `${x.from}>${x.to}`),
    );
    for (const from of ENTREGA_STAGES) {
      for (const to of ENTREGA_STAGES) {
        if (from !== to && canTransitionEntrega(from, to)) {
          expect(named.has(`${from}>${to}`), `${from} → ${to}`).toBe(true);
        }
      }
    }
  });

  it("toda transição de INFLUENCIADOR da tabela é permitida pela máquina de estados real", () => {
    for (const t of DEMO_TRANSITIONS.filter((x) => x.entity === "influenciador")) {
      // "Reabrir decisão" (APROVADO → ENVIADO_AO_CLIENTE) é uma ação do próprio cliente, feita
      // por `reopenInfluApprovalByCliente` com a trava `canReopenInfluApproval`; a tabela
      // `INFLU_TRANSITIONS` não a lista (só APROVADO → RECUSADO). Divergência que já existe no
      // produto — a Demo a reflete, não a corrige.
      if (t.via === "reopenInfluApprovalByCliente") continue;
      expect(canTransitionInflu(t.from as InfluStatus, t.to as InfluStatus), t.id).toBe(true);
    }
  });

  it("reabrir a decisão respeita a trava do produto (entrega além do roteiro bloqueia)", () => {
    expect(() => reopenInfluApprovalByCliente(influ("APROVADO", "ROTEIRO_PRODUCAO"))).not.toThrow();
    expect(() => reopenInfluApprovalByCliente(influ("APROVADO", "PRODUCAO"))).toThrow(
      /não é possível reabrir/i,
    );
    expect(canTransitionInflu("APROVADO", "ENVIADO_AO_CLIENTE")).toBe(false);
  });

  it("ações do cliente em entrega só funcionam nos dois estágios de aprovação (as demais lançam)", () => {
    const approvalStages: EntregaStage[] = ["ROTEIRO_APROVACAO", "CONTEUDO_APROVACAO"];
    for (const stage of ENTREGA_STAGES) {
      const call = () => applyEntregaApproval(influ("APROVADO", stage), "e1", "aprovado");
      if (approvalStages.includes(stage)) expect(call, stage).not.toThrow();
      else expect(call, stage).toThrow();
    }
  });

  it("ações do time na entrega lançam fora do estágio de origem da tabela", () => {
    const teamActions = DEMO_TRANSITIONS.filter((t) => t.via === "applyEntregaAction");
    for (const t of teamActions) {
      for (const stage of ENTREGA_STAGES) {
        const call = () => applyEntregaAction(entrega(stage), t.action as EntregaEngineActionKind);
        if (stage === t.from) expect(call, `${t.id} em ${stage}`).not.toThrow();
        else expect(call, `${t.id} em ${stage}`).toThrow();
      }
    }
  });

  it("pedir ajuste exige motivo (regra que já existe na função real)", () => {
    expect(() =>
      applyEntregaApproval(influ("APROVADO", "ROTEIRO_APROVACAO"), "e1", "reprovado", "  "),
    ).toThrow(/comentário/i);
    for (const t of DEMO_TRANSITIONS.filter(
      (x) => x.action === "reprovado" && x.entity !== "influenciador",
    )) {
      expect(t.requiresReason, t.id).toBe(true);
    }
  });

  it("todos os estados do pedido (pending…adjustment_requested) estão cobertos", () => {
    const wanted: DemoSpecState[] = [
      "pending",
      "approved",
      "rejected",
      "replacement_selected",
      "resubmitted",
      "adjustment_requested",
    ];
    const covered = new Set(DEMO_TRANSITIONS.flatMap((t) => t.specStates));
    for (const s of wanted) expect(covered.has(s), s).toBe(true);
  });

  it("D2: substituir é enviar OUTRO da curadoria — mesma transição de `pending`, sem ação nova", () => {
    const t = DEMO_TRANSITIONS.find((x) => x.specStates.includes("replacement_selected"));
    expect(t?.id).toBe("influ.enviar_ao_cliente");
    expect(t?.from).toBe("EM_CURADORIA");
    expect(t?.via).toBe("canTransitionInflu");
  });

  it("ids são únicos e `findDemoTransition` os resolve", () => {
    const ids = DEMO_TRANSITIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(findDemoTransition(id)?.id).toBe(id);
    expect(findDemoTransition("nao.existe")).toBeUndefined();
  });
});

describe("availableDemoTransitions", () => {
  it("cliente com perfil enviado: aprovar ou não aprovar", () => {
    const ids = availableDemoTransitions("influenciador", "cliente", "ENVIADO_AO_CLIENTE").map(
      (t) => t.id,
    );
    expect(ids.sort()).toEqual(["influ.aprovar", "influ.reprovar"]);
  });

  it("time com perfil recusado: só reenviar", () => {
    expect(availableDemoTransitions("influenciador", "time", "RECUSADO").map((t) => t.id)).toEqual([
      "influ.reenviar",
    ]);
  });

  it("cliente em roteiro aguardando: aprovar ou pedir ajuste; em produção: nada", () => {
    expect(
      availableDemoTransitions("roteiro", "cliente", "ROTEIRO_APROVACAO")
        .map((t) => t.id)
        .sort(),
    ).toEqual(["roteiro.aprovar", "roteiro.pedir_ajuste"]);
    expect(availableDemoTransitions("roteiro", "cliente", "PRODUCAO")).toEqual([]);
  });

  it("estados terminais não oferecem ação", () => {
    expect(availableDemoTransitions("conteudo", "time", "PUBLICADA")).toEqual([]);
    expect(availableDemoTransitions("conteudo", "cliente", "PUBLICADA")).toEqual([]);
  });
});

describe("guarda de status do influenciador na resposta do cliente", () => {
  it("só `ENVIADO_AO_CLIENTE` aceita resposta", () => {
    for (const s of INFLU_STATUSES) {
      expect(canClienteRespondInflu(s), s).toBe(s === "ENVIADO_AO_CLIENTE");
    }
  });

  it("assert lança DemoError seguro para qualquer outro status", () => {
    expect(() => assertClienteCanRespondInflu("EM_CURADORIA")).toThrow(DemoError);
    expect(() => assertClienteCanRespondInflu("APROVADO")).toThrow(/aguardando a decisão/);
    expect(() => assertClienteCanRespondInflu("ENVIADO_AO_CLIENTE")).not.toThrow();
  });
});
