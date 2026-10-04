import { describe, expect, it } from "vitest";
import { applyEntregaApproval, applyInfluApproval } from "@/lib/campanha-aprovacao";
import { isVisibleToClientPortal } from "@/lib/cliente-link.functions";
import { deriveEntregaNextStep } from "@/lib/entrega-engine";
import type { Influ } from "@/lib/influencer-model";
import {
  DEMO_SEED_VERSION,
  buildDemoScenario,
  demoCampanhaId,
  demoClienteId,
  demoUuid,
  type DemoAssetSpec,
  type DemoScenario,
} from "./cenario-campanha-completa";
import { canClienteRespondInflu } from "./demo-estados";

// 2026-10-05 12:00 em Brasília (UTC-3).
const NOW = new Date("2026-10-05T15:00:00.000Z");
const SESSION = "11111111-2222-4333-8444-555555555555";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const assetUrl = (spec: DemoAssetSpec) => `https://assets.test/${spec.bucket}/${spec.path}`;

function build(overrides: Partial<Parameters<typeof buildDemoScenario>[0]> = {}): DemoScenario {
  return buildDemoScenario({
    sessionId: SESSION,
    clienteId: demoClienteId(SESSION),
    campanhaId: demoCampanhaId(SESSION),
    now: NOW,
    empresa: "Praia Bonita Resorts",
    responsavel: "Ana Souza",
    assetUrl,
    ...overrides,
  });
}

const entregasDe = (s: DemoScenario) => s.payload.influenciadores.flatMap((r) => r.data.entregas);
const influ = (s: DemoScenario, nome: string): Influ => {
  const found = s.payload.influenciadores.find((r) => r.data.nome === nome);
  if (!found) throw new Error(`influenciador ${nome} não existe no cenário`);
  return found.data;
};

describe("contagens e estados pedidos", () => {
  const s = build();

  it("7 influenciadores: 2 aguardando, 2 aprovados, 1 recusado e 2 na curadoria", () => {
    expect(s.payload.influenciadores).toHaveLength(7);
    expect(s.summary.influenciadoresPorStatus).toEqual({
      INSCRITO: 0,
      EM_CURADORIA: 2,
      ENVIADO_AO_CLIENTE: 2,
      APROVADO: 2,
      RECUSADO: 1,
    });
  });

  it("roteiros: 2 aguardando, 1 aprovado (em produção) e 1 com ajuste", () => {
    expect(s.summary.entregasPorEstagio.ROTEIRO_APROVACAO).toBe(2);
    expect(s.summary.entregasPorEstagio.PRODUCAO).toBe(1);
    expect(s.summary.entregasPorEstagio.ROTEIRO_AJUSTES).toBe(1);
  });

  it("conteúdos: 2 aguardando, 2 aprovados (já publicados) e 1 com ajuste", () => {
    expect(s.summary.entregasPorEstagio.CONTEUDO_APROVACAO).toBe(2);
    expect(s.summary.entregasPorEstagio.PUBLICADA).toBe(2);
    expect(s.summary.entregasPorEstagio.CONTEUDO_AJUSTES).toBe(1);
    expect(s.summary.totalEntregas).toBe(9);
  });

  it("tarefas em estados variados, cronograma, documentos e 1 relatório mensal", () => {
    expect(s.summary.tarefas).toBe(6);
    expect(new Set(s.payload.tarefas.map((t) => t.data.status)).size).toBeGreaterThanOrEqual(4);
    expect(s.summary.cronograma).toBe(5);
    expect(s.summary.documentos).toBe(3);
    expect(s.summary.relatorios).toBe(1);
  });

  it("o planejado da campanha (linhas) bate com o total de entregas", () => {
    const planejado = s.payload.cliente.campanhas[0].linhas.reduce((n, l) => n + l.quantidade, 0);
    expect(planejado).toBe(s.summary.totalEntregas);
  });

  it("métricas só nas entregas publicadas, e todas as métricas são do conjunto que existe no produto", () => {
    const comMetricas = entregasDe(s).filter((e) => e.metrics);
    expect(comMetricas.map((e) => e.stage)).toEqual(["PUBLICADA", "PUBLICADA"]);
    for (const e of comMetricas) {
      expect(Object.keys(e.metrics!).sort()).toEqual(
        ["comments", "likes", "reach", "saves", "shares", "views"].sort(),
      );
    }
  });
});

describe("determinismo e ids", () => {
  it("mesmos argumentos ⇒ conteúdo idêntico (reiniciar recria o cenário inicial)", () => {
    expect(build()).toEqual(build());
  });

  it("outro `now` muda só as datas, nunca os ids", () => {
    const a = build();
    const b = build({ now: new Date("2026-12-20T15:00:00.000Z") });
    expect(b.payload.influenciadores.map((r) => r.id)).toEqual(
      a.payload.influenciadores.map((r) => r.id),
    );
    expect(b.payload.tarefas.map((r) => r.id)).toEqual(a.payload.tarefas.map((r) => r.id));
    expect(b.payload.cliente.campanhas[0].dataInicio).not.toBe(
      a.payload.cliente.campanhas[0].dataInicio,
    );
  });

  it("outra sessão ⇒ nenhum id em comum", () => {
    const other = "99999999-8888-4777-8666-555555555555";
    const a = build();
    const b = build({
      sessionId: other,
      clienteId: demoClienteId(other),
      campanhaId: demoCampanhaId(other),
    });
    const idsA = new Set([
      ...a.payload.influenciadores.map((r) => r.id),
      ...a.payload.tarefas.map((r) => r.id),
      ...a.payload.documentos.map((r) => r.id),
      ...a.payload.cronograma.map((r) => r.id),
    ]);
    for (const r of [
      ...b.payload.influenciadores,
      ...b.payload.tarefas,
      ...b.payload.documentos,
      ...b.payload.cronograma,
    ]) {
      expect(idsA.has(r.id)).toBe(false);
    }
  });

  it("todos os ids de linha são UUID válidos e únicos", () => {
    const s = build();
    const all = [
      ...s.payload.influenciadores.map((r) => r.id),
      ...s.payload.tarefas.map((r) => r.id),
      ...s.payload.documentos.map((r) => r.id),
      ...s.payload.cronograma.map((r) => r.id),
    ];
    for (const id of all) expect(id).toMatch(UUID_RE);
    expect(new Set(all).size).toBe(all.length);
    expect(demoClienteId(SESSION)).toMatch(UUID_RE);
    expect(demoCampanhaId(SESSION)).toMatch(UUID_RE);
    expect(demoClienteId(SESSION)).not.toBe(demoCampanhaId(SESSION));
  });

  it("o id dentro do JSON de cada linha é o próprio id da linha (o banco também força isso)", () => {
    const s = build();
    for (const r of [
      ...s.payload.influenciadores,
      ...s.payload.tarefas,
      ...s.payload.documentos,
      ...s.payload.cronograma,
    ]) {
      expect(r.data.id).toBe(r.id);
    }
  });

  it("`demoUuid` é estável e depende de namespace e nome", () => {
    expect(demoUuid("a", "b")).toBe(demoUuid("a", "b"));
    expect(demoUuid("a", "b")).not.toBe(demoUuid("a", "c"));
    expect(demoUuid("a", "b")).not.toBe(demoUuid("x", "b"));
  });

  it("versão da semente exposta", () => {
    expect(DEMO_SEED_VERSION).toBe(1);
  });
});

describe("isolamento e ausência de dado real", () => {
  const s = build();

  it("cliente leva o marcador imutável e exatamente UMA campanha, a da sessão", () => {
    const c = s.payload.cliente;
    expect(c.id).toBe(demoClienteId(SESSION));
    expect(c.demoSessionId).toBe(SESSION);
    expect(c.campanhas).toHaveLength(1);
    expect(c.campanhas[0].id).toBe(demoCampanhaId(SESSION));
  });

  it("nome da empresa vem do lead; responsável cai num rótulo neutro quando falta", () => {
    expect(s.payload.cliente.empresa).toBe("Praia Bonita Resorts");
    expect(s.payload.cliente.responsavel).toBe("Ana Souza");
    expect(build({ responsavel: undefined }).payload.cliente.responsavel).toBe(
      "Responsável (demonstração)",
    );
    expect(build({ responsavel: "   " }).payload.cliente.responsavel).toBe(
      "Responsável (demonstração)",
    );
  });

  it("nenhum e-mail, telefone ou WhatsApp em cliente nem em influenciadores", () => {
    expect(s.payload.cliente.email).toBe("");
    expect(s.payload.cliente.whatsapp).toBe("");
    for (const { data } of s.payload.influenciadores) {
      expect(data.email).toBeUndefined();
      expect(data.telefone).toBeUndefined();
    }
  });

  it("nenhum dado financeiro: sem pagamento, banco, contrato, valor ou orçamento; sem faturamento", () => {
    const camp = s.payload.cliente.campanhas[0];
    expect(camp.semFaturamento).toBe(true);
    expect(camp.semFaturamentoMotivo).toMatch(/demonstração/i);
    expect(camp.valorCliente).toBe("");
    expect(camp.orcamento).toBe("");
    expect(camp.pagTipos).toEqual([]);
    for (const { data } of s.payload.influenciadores) {
      expect(data.pagamento).toBeUndefined();
      expect(data.bank).toBeUndefined();
      expect(data.contrato).toBeUndefined();
    }
  });

  it("a campanha não tem link de inscrição nem token público", () => {
    expect(s.payload.cliente.campanhas[0].signupToken).toBeUndefined();
    expect(s.payload.cliente.campanhas[0].inscricaoPage).toBeUndefined();
    expect((s.payload.cliente as Record<string, unknown>).publicToken).toBeUndefined();
  });

  it("tarefas sem responsável e SEM a tag `Cliente` (que o sino do time lê como 'Nova solicitação')", () => {
    for (const { data } of s.payload.tarefas) {
      expect(data.assignee).toBeUndefined();
      expect(data.assignees).toBeUndefined();
      expect(data.tags ?? []).not.toContain("Cliente");
    }
  });

  it("handles fictícios e URLs externas só em domínios reservados/de assets", () => {
    for (const { data } of s.payload.influenciadores) {
      expect(data.redes[0].handle).toMatch(/\.demo$/);
    }
    const urls: string[] = [];
    for (const e of entregasDe(s)) {
      if (e.url) urls.push(e.url);
      for (const a of e.anexos ?? []) urls.push(a.url);
    }
    for (const d of s.payload.documentos) urls.push(d.data.url);
    for (const u of urls) {
      expect(["example.com", "assets.test"]).toContain(new URL(u).hostname);
    }
  });

  it("a campanha aparece no Portal do Cliente (ativa e visível) — decisão do servidor", () => {
    expect(isVisibleToClientPortal(s.payload.cliente.campanhas[0])).toBe(true);
  });
});

describe("coerência de estado de cada entrega", () => {
  const s = build();

  it("anexos e motivos batem com o estágio", () => {
    for (const e of entregasDe(s)) {
      const cats = (e.anexos ?? []).map((a) => a.categoria);
      expect(cats, e.titulo).toContain("Roteiro");
      const temConteudo = cats.includes("Conteúdo final");
      const posConteudo = [
        "CONTEUDO_APROVACAO",
        "CONTEUDO_AJUSTES",
        "PUBLICACAO",
        "PUBLICADA",
      ].includes(e.stage);
      expect(temConteudo, e.titulo).toBe(posConteudo);
      expect(Boolean(e.roteiroReprovacao), e.titulo).toBe(e.stage === "ROTEIRO_AJUSTES");
      expect(Boolean(e.conteudoReprovacao), e.titulo).toBe(e.stage === "CONTEUDO_AJUSTES");
      expect(e.status === "publicado", e.titulo).toBe(e.stage === "PUBLICADA");
      expect(Boolean(e.publicadoEm && e.url && e.metrics), e.titulo).toBe(e.stage === "PUBLICADA");
    }
  });

  it("o motor de entrega aponta o cliente exatamente nos estágios de aprovação", () => {
    for (const e of entregasDe(s)) {
      const aguardaCliente = e.stage === "ROTEIRO_APROVACAO" || e.stage === "CONTEUDO_APROVACAO";
      expect(deriveEntregaNextStep(e).responsavel === "cliente", e.titulo).toBe(aguardaCliente);
    }
  });

  it("só influenciadores APROVADOS têm entregas", () => {
    for (const { data } of s.payload.influenciadores) {
      expect(data.entregas.length > 0, data.nome).toBe(data.status === "APROVADO");
    }
  });

  it("anexo de ajuste não carrega carimbo de prontidão (o motor exige reenvio)", () => {
    const aj = entregasDe(s).find((e) => e.stage === "ROTEIRO_AJUSTES")!;
    expect(aj.dataRecebimentoRoteiro).toBeUndefined();
    const cj = entregasDe(s).find((e) => e.stage === "CONTEUDO_AJUSTES")!;
    expect(cj.dataRecebimentoConteudo).toBeUndefined();
  });
});

describe("histórico (activityEvents / activity)", () => {
  const s = build();

  it("em ordem cronológica, nunca no futuro, com `activity` espelhando os eventos de ação", () => {
    for (const { data } of s.payload.influenciadores) {
      const ev = data.activityEvents ?? [];
      const sorted = [...ev].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      expect(ev, data.nome).toEqual(sorted);
      for (const e of ev)
        expect(Date.parse(e.createdAt), `${data.nome}:${e.kind}`).toBeLessThanOrEqual(
          NOW.getTime(),
        );
      const acoes = ev.filter(
        (e) => e.kind !== "comentario_cliente" && e.kind !== "comentario_equipe",
      );
      expect((data.activity ?? []).length, data.nome).toBe(acoes.length);
    }
  });

  it("o histórico acompanha o status do perfil", () => {
    const kinds = (nome: string) => (influ(s, nome).activityEvents ?? []).map((e) => e.kind);
    expect(kinds("Mariana Alves")).toEqual(["perfil_enviado"]);
    expect(kinds("Thiago Nunes")).toEqual([]);
    expect(kinds("Beatriz Costa")).toContain("perfil_recusado");
    expect(kinds("Camila Duarte")).toContain("perfil_aprovado");
    const recusa = influ(s, "Beatriz Costa").activityEvents!.find(
      (e) => e.kind === "perfil_recusado",
    )!;
    expect(recusa.actor.type).toBe("cliente");
    expect(recusa.motivoLabel).toBe("Público incompatível");
    expect(influ(s, "Beatriz Costa").clienteReprovacao?.motivo).toMatch(/Público incompatível/);
  });

  it("autores do histórico são rótulos neutros (nunca uma pessoa real)", () => {
    const names = new Set(
      s.payload.influenciadores.flatMap((r) =>
        (r.data.activityEvents ?? []).map((e) => e.actor.name),
      ),
    );
    expect([...names].sort()).toEqual(["Cliente (demonstração)", "Equipe VNH"]);
  });

  it("comentário do cliente e da equipe ficam em canais separados", () => {
    expect(influ(s, "Camila Duarte").clienteComments).toHaveLength(1);
    expect(influ(s, "Camila Duarte").comments).toHaveLength(0);
    expect(influ(s, "Lucas Ferraz").comments).toHaveLength(1);
    expect(influ(s, "Lucas Ferraz").clienteComments).toHaveLength(0);
  });
});

describe("arquivos de exemplo (assets)", () => {
  const s = build();

  it("todos ficam sob `demo/<sessionId>/` e têm chave e caminho únicos", () => {
    expect(s.assetSpecs.length).toBe(s.summary.assets);
    expect(new Set(s.assetSpecs.map((a) => a.key)).size).toBe(s.assetSpecs.length);
    expect(new Set(s.assetSpecs.map((a) => a.path)).size).toBe(s.assetSpecs.length);
    for (const a of s.assetSpecs) {
      expect(a.path.startsWith(`demo/${SESSION}/`), a.key).toBe(true);
      expect(a.path.endsWith(`.${a.kind}`), a.key).toBe(true);
    }
  });

  it("toda URL de anexo/documento vem de um asset registrado (nada aponta para arquivo real)", () => {
    const known = new Set(s.assetSpecs.map(assetUrl));
    for (const e of entregasDe(s))
      for (const a of e.anexos ?? []) expect(known.has(a.url), a.nome).toBe(true);
    for (const d of s.payload.documentos.filter((x) => x.data.tipo === "anexo")) {
      expect(known.has(d.data.url), d.data.titulo).toBe(true);
    }
  });

  it("o relatório mensal aponta para o PDF do bucket `relatorios-mensais`", () => {
    const rel = s.payload.cliente.campanhas[0].relatoriosMensais![0];
    const spec = s.assetSpecs.find((a) => a.path === rel.storagePath)!;
    expect(spec.bucket).toBe("relatorios-mensais");
    expect(spec.kind).toBe("pdf");
    expect(rel.mes).toBe("2026-09");
  });

  it("a lista de assets independe das URLs (1ª passada só para descobrir o que publicar)", () => {
    const dry = build({ assetUrl: () => "pending" });
    expect(dry.assetSpecs).toEqual(s.assetSpecs);
  });
});

describe("relatório mensal coerente com as métricas", () => {
  it("os totais do PDF são a soma das métricas das entregas publicadas", () => {
    const s = build();
    const m = entregasDe(s).flatMap((e) => (e.metrics ? [e.metrics] : []));
    const soma = (k: "reach" | "views") => m.reduce((n, x) => n + (x[k] ?? 0), 0);
    const inter = m.reduce(
      (n, x) => n + (x.likes ?? 0) + (x.comments ?? 0) + (x.shares ?? 0) + (x.saves ?? 0),
      0,
    );
    const rel = s.assetSpecs.find((a) => a.key === "relatorio-mensal")!;
    expect(rel.lines).toContain(`Alcance total: ${soma("reach").toLocaleString("pt-BR")}`);
    expect(rel.lines).toContain(`Visualizações: ${soma("views").toLocaleString("pt-BR")}`);
    expect(rel.lines.some((l) => l.endsWith(`: ${inter.toLocaleString("pt-BR")}`))).toBe(true);
    expect(soma("reach")).toBe(106650);
    expect(soma("views")).toBe(139500);
  });
});

describe("datas relativas (Brasília)", () => {
  it("hoje = 2026-10-05; mês anterior = 2026-09; viradas de ano", () => {
    const s = build();
    expect(s.payload.cliente.clienteDesde).toBe("2026-09-15");
    expect(s.payload.cliente.campanhas[0].prazo).toBe("2026-10-30");
    expect(s.payload.cliente.campanhas[0].relatoriosMensais![0].mes).toBe("2026-09");
    const jan = build({ now: new Date("2026-01-03T15:00:00.000Z") });
    expect(jan.payload.cliente.campanhas[0].relatoriosMensais![0].mes).toBe("2025-12");
  });

  it("uma hora após a meia-noite UTC ainda é o dia anterior em Brasília", () => {
    const s = build({ now: new Date("2026-10-06T01:00:00.000Z") });
    expect(s.payload.cliente.campanhas[0].dataInicio).toBe("2026-09-15");
  });
});

describe("o cenário funciona com as funções reais do produto", () => {
  it("o cliente aprova um perfil enviado e o status muda; só ENVIADO_AO_CLIENTE aceita resposta", () => {
    const s = build();
    const mariana = influ(s, "Mariana Alves");
    expect(canClienteRespondInflu(mariana.status)).toBe(true);
    expect(applyInfluApproval(mariana, "aprovado").status).toBe("APROVADO");
    const reprovado = applyInfluApproval(
      influ(s, "Rafael Monteiro"),
      "reprovado",
      "Métricas insuficientes",
    );
    expect(reprovado.status).toBe("RECUSADO");
    expect(canClienteRespondInflu(influ(s, "Thiago Nunes").status)).toBe(false);
  });

  it("o cliente aprova um roteiro aguardando e a entrega vai para produção", () => {
    const s = build();
    const camila = influ(s, "Camila Duarte");
    const aguardando = camila.entregas.find((e) => e.stage === "ROTEIRO_APROVACAO")!;
    const next = applyEntregaApproval(camila, aguardando.id, "aprovado");
    expect(next.entregas.find((e) => e.id === aguardando.id)!.stage).toBe("PRODUCAO");
  });

  it("o cliente pede ajuste num conteúdo aguardando e a entrega vai para ajustes", () => {
    const s = build();
    const lucas = influ(s, "Lucas Ferraz");
    const aguardando = lucas.entregas.find((e) => e.stage === "CONTEUDO_APROVACAO")!;
    const next = applyEntregaApproval(lucas, aguardando.id, "reprovado", "Trocar o enquadramento.");
    expect(next.entregas.find((e) => e.id === aguardando.id)!.stage).toBe("CONTEUDO_AJUSTES");
  });
});
