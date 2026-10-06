import { describe, expect, it } from "vitest";
import { classificarAcao, entregaLog, historicoEventos } from "./entrega-historico";
import type { Entrega, InfluActivity } from "./influencer-model";

const ent = (o: Partial<Entrega> = {}): Entrega =>
  ({
    id: "e1",
    tipo: "Reels",
    quantidade: 1,
    status: "combinado",
    stage: "ROTEIRO_PRODUCAO",
    ...o,
  }) as Entrega;
let n = 0;
const act = (author: string, action: string, min: number, entregaId = "e1"): InfluActivity => ({
  id: `a${++n}`,
  author,
  initials: author.slice(0, 2),
  color: "",
  action,
  entregaId,
  createdAt: new Date(Date.UTC(2026, 9, 5, 12, min)).toISOString(),
});

const MOTIVO =
  "Aqui nesse espaço, seria mais apropriado falar o nome do Poupa Tempo RJ — outro ponto…";

describe("classificar a linha da Atividade", () => {
  it("decisões do cliente, com o texto completo do feedback (inclusive com travessão)", () => {
    expect(
      classificarAcao(`solicitou ajustes em o roteiro de uma entrega — ${MOTIVO}`),
    ).toMatchObject({ kind: "feedback", etapa: "roteiro", motivo: MOTIVO });
    expect(
      classificarAcao("solicitou ajustes em o conteúdo de uma entrega — Trocar a trilha"),
    ).toMatchObject({
      kind: "feedback",
      etapa: "conteudo",
      texto: "solicitou ajustes no conteúdo final",
    });
    expect(classificarAcao("aprovou o roteiro de uma entrega")).toMatchObject({
      kind: "aprovado",
      etapa: "roteiro",
      texto: "aprovou o roteiro",
    });
  });

  it("ações da equipe: motor, arquivos, prazo, legenda, publicação", () => {
    expect(classificarAcao('reconheceu os ajustes pedidos no roteiro — "Reels"')).toMatchObject({
      kind: "reconhecido",
      texto: "reconheceu os ajustes solicitados",
    });
    expect(classificarAcao('enviou o roteiro pra aprovação do cliente — "Reels"')).toMatchObject({
      kind: "enviado",
      etapa: "roteiro",
      texto: "enviou o roteiro para aprovação",
    });
    expect(classificarAcao('anexou o conteúdo final — "Reels"')).toMatchObject({
      kind: "anexo",
      texto: "anexou o conteúdo final",
    });
    expect(classificarAcao('adicionou Roteiro V2: "ROTEIRO v2.pdf" — "Reels"')).toMatchObject({
      kind: "anexo",
      texto: 'adicionou Roteiro V2: "ROTEIRO v2.pdf"',
    });
    expect(classificarAcao('removeu o arquivo "x.pdf" — "Reels"').kind).toBe("anexo");
    expect(classificarAcao('alterou o prazo de Publicação para 14 out — "Reels"').kind).toBe(
      "prazo",
    );
    expect(classificarAcao('atualizou a legenda — "Reels"').kind).toBe("legenda");
    expect(classificarAcao('marcou como publicada — "Reels"').kind).toBe("publicado");
    expect(classificarAcao('moveu "Reels" pra Conteúdo').kind).toBe("movido");
    expect(classificarAcao("qualquer outra coisa")).toMatchObject({
      kind: "outro",
      texto: "qualquer outra coisa",
    });
  });
});

describe("histórico da entrega", () => {
  const historia = [
    act("Toni", 'anexou o roteiro — "Reels"', 0),
    act("Toni", 'enviou o roteiro pra aprovação do cliente — "Reels"', 1),
    act("Julia", `solicitou ajustes em o roteiro de uma entrega — ${MOTIVO}`, 2),
    act("Toni", 'reconheceu os ajustes pedidos no roteiro — "Reels"', 3),
    act("Toni", 'enviou o roteiro pra aprovação do cliente — "Reels"', 4),
    act("Julia", "solicitou ajustes em o roteiro de uma entrega — Mais um ajuste", 5),
    act("Toni", 'reconheceu os ajustes pedidos no roteiro — "Reels"', 6),
    act("Toni", 'enviou o roteiro pra aprovação do cliente — "Reels"', 7),
    act("Julia", "aprovou o roteiro de uma entrega", 8),
    // de outra entrega: não entra
    act("Toni", 'anexou o roteiro — "Story"', 9, "outra"),
  ];

  it("conta a história: V1, V2 do cliente, aprovação V3, e o envio depois de ajuste vira reenvio", () => {
    const ev = historicoEventos(historia, ent({ stage: "PRODUCAO" }));
    expect(ev).toHaveLength(9);
    // mais recente primeiro
    expect(ev.map((x) => x.kind)).toEqual([
      "aprovado",
      "reenviado",
      "reconhecido",
      "feedback",
      "reenviado",
      "reconhecido",
      "feedback",
      "enviado",
      "anexo",
    ]);
    const feedbacks = ev.filter((x) => x.kind === "feedback");
    expect(feedbacks.map((f) => f.versao)).toEqual([2, 1]);
    expect(feedbacks[1].motivo).toBe(MOTIVO);
    expect(ev[0]).toMatchObject({ versao: 3, texto: "aprovou o roteiro", autor: "Julia" });
    expect(ev[1].texto).toBe("reenviou o roteiro para aprovação");
    expect(ev[7].texto).toBe("enviou o roteiro para aprovação");
  });

  it("a numeração é independente por etapa", () => {
    const ev = historicoEventos(
      [
        act("Julia", "solicitou ajustes em o roteiro de uma entrega — A", 0),
        act("Julia", "solicitou ajustes em o conteúdo de uma entrega — B", 1),
        act("Julia", "solicitou ajustes em o conteúdo de uma entrega — C", 2),
      ],
      ent({ stage: "PUBLICACAO" }),
    );
    const por = Object.fromEntries(ev.map((x) => [x.motivo, `${x.etapa}-${x.versao}`]));
    expect(por).toEqual({ A: "roteiro-1", B: "conteudo-1", C: "conteudo-2" });
  });

  it("só o último feedback com ajuste aberto fica pendente; reenviado ou aprovado, não", () => {
    const veredito = { motivo: "Mais um ajuste", respondedAt: "2026-10-05T12:05:00.000Z" };
    const aberto = historicoEventos(
      historia.slice(0, 6),
      ent({ stage: "ROTEIRO_AJUSTES", roteiroReprovacao: veredito }),
    );
    expect(aberto.filter((x) => x.pendente).map((x) => x.versao)).toEqual([2]);
    const reenviado = historicoEventos(
      historia.slice(0, 8),
      ent({ stage: "ROTEIRO_APROVACAO", roteiroReprovacao: veredito }),
    );
    expect(reenviado.some((x) => x.pendente)).toBe(false);
    expect(historicoEventos(historia, ent({ stage: "PRODUCAO" })).some((x) => x.pendente)).toBe(
      false,
    );
  });

  it("feedback antigo continua aparecendo: o carimbo vivo sem linha na Atividade vira evento", () => {
    const veredito = {
      motivo: "Trocar a trilha",
      respondedAt: "2026-10-05T12:30:00.000Z",
      autorNome: "Julia",
    };
    const ev = historicoEventos(
      [],
      ent({ stage: "CONTEUDO_AJUSTES", conteudoReprovacao: veredito }),
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      kind: "feedback",
      etapa: "conteudo",
      versao: 1,
      autor: "Julia",
      motivo: "Trocar a trilha",
      pendente: true,
    });
    // com a linha presente, não duplica
    const dup = historicoEventos(
      [act("Julia", "solicitou ajustes em o conteúdo de uma entrega — Trocar a trilha", 30)],
      ent({ stage: "CONTEUDO_AJUSTES", conteudoReprovacao: veredito }),
    );
    expect(dup).toHaveLength(1);
  });

  it("sem eventos → lista vazia", () => {
    expect(historicoEventos(undefined, ent())).toEqual([]);
  });
});

describe("textos gravados pelo detalhe da entrega", () => {
  const label = "Reels · Verão";

  it("cada frase é lida de volta pelo classificador, sem sufixo da entrega", () => {
    const casos: [string, string, string][] = [
      [
        entregaLog.arquivosAdicionados("Roteiro", ["a.pdf"], 1, label),
        "anexo",
        'adicionou o arquivo "a.pdf" em Roteiro',
      ],
      [
        entregaLog.arquivosAdicionados("Gravação", ["a.mp4", "b.mp4", "c.mp4"], 1, label),
        "anexo",
        "adicionou 3 arquivos em Gravação",
      ],
      [
        entregaLog.arquivosAdicionados("Conteúdo final", ["a.mp4"], 2, label),
        "anexo",
        "adicionou a V2 em Conteúdo final",
      ],
      [
        entregaLog.arquivoSubstituido("Roteiro", 2, "a.pdf", "b.pdf", label),
        "anexo",
        'substituiu "a.pdf" por "b.pdf" em Roteiro (V2)',
      ],
      [entregaLog.versaoRemovida("Roteiro", 3, label), "anexo", "removeu a V3 de Roteiro"],
      [entregaLog.arquivoRemovido("a.pdf", label), "anexo", 'removeu o arquivo "a.pdf"'],
      [
        entregaLog.prazo("Publicação", "2026-10-14", label),
        "prazo",
        "alterou o prazo de Publicação para 14 out",
      ],
      [entregaLog.prazo("Roteiro", undefined, label), "prazo", "removeu o prazo de Roteiro"],
      [entregaLog.publicacao(label), "outro", "atualizou o link e as métricas da publicação"],
      [entregaLog.legenda(true, label), "legenda", "atualizou a legenda"],
      [entregaLog.legenda(false, label), "legenda", "removeu a legenda"],
    ];
    for (const [texto, kind, esperado] of casos) {
      const c = classificarAcao(texto);
      expect(c.kind, texto).toBe(kind);
      expect(c.texto, texto).toBe(esperado);
    }
  });

  it("nome de arquivo com aspas ou travessão não quebra a leitura", () => {
    const c = classificarAcao(
      entregaLog.arquivosAdicionados("Roteiro", ['roteiro "final" — v2.pdf'], 1, label),
    );
    expect(c.kind).toBe("anexo");
    expect(c.texto.startsWith("adicionou o arquivo")).toBe(true);
  });
});
