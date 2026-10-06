import { describe, expect, it } from "vitest";
import {
  agruparAnexos,
  arquivoTipo,
  entregaFaseColuna,
  entregaFocus,
  entregaStepper,
  entregaUnidadesLabel,
  formatDiaMes,
  historicoDaEntrega,
  historicoTexto,
  legendaCanal,
  linkDoPost,
  metricasResumo,
  publicacaoAtrasoDias,
  removerVersao,
  substituirArquivo,
  tilesDaEntrega,
  versaoDoAnexo,
} from "./entrega-detail";
import type { Entrega, EntregaAnexo, InfluActivity } from "./influencer-model";

const ent = (o: Partial<Entrega> = {}): Entrega =>
  ({
    id: "e1",
    tipo: "Reels",
    quantidade: 1,
    status: "combinado",
    stage: "ROTEIRO_PRODUCAO",
    ...o,
  }) as Entrega;
const anexo = (o: Partial<EntregaAnexo> = {}): EntregaAnexo => ({
  id: Math.random().toString(36).slice(2),
  categoria: "Roteiro",
  nome: "arquivo.pdf",
  url: "https://x/arquivo.pdf",
  ...o,
});
const veredito = { motivo: "Ajustar", respondedAt: "2026-10-05T16:00:00.000Z", autorNome: "Julia" };

describe("próxima ação da entrega", () => {
  it("sem roteiro → adicionar (upload); com roteiro → enviar para aprovação (motor)", () => {
    const sem = entregaFocus(ent());
    expect(sem).toMatchObject({
      rotulo: "Próxima ação",
      title: "Roteiro pendente",
      tone: "progress",
      primary: { kind: "upload", action: "anexar_roteiro", categoria: "Roteiro" },
    });
    const com = entregaFocus(ent({ anexos: [anexo()] }));
    expect(com.primary).toMatchObject({
      kind: "engine",
      action: "enviar_roteiro",
      label: "Enviar para aprovação",
    });
  });

  it("aguardando o cliente → sem botão principal, com link para abrir o arquivo em análise", () => {
    const r = entregaFocus(ent({ stage: "ROTEIRO_APROVACAO", anexos: [anexo()] }));
    expect(r.primary).toBeUndefined();
    expect(r).toMatchObject({ tone: "waiting", openCategoria: "Roteiro" });
    const c = entregaFocus(ent({ stage: "CONTEUDO_APROVACAO" }));
    expect(c).toMatchObject({ openCategoria: "Conteúdo final" });
  });

  it("ajustes solicitados → 'Ver feedback →' (a ação que o motor chama de reconhecer), tom de ajuste", () => {
    const f = entregaFocus(ent({ stage: "ROTEIRO_AJUSTES", roteiroReprovacao: veredito }));
    expect(f).toMatchObject({
      title: "Ajustes solicitados pelo cliente",
      tone: "adjust",
      primary: {
        kind: "ajuste",
        step: "reconhecer",
        label: "Ver feedback →",
        action: "reconhecer_ajustes_roteiro",
      },
    });
    const c = entregaFocus(ent({ stage: "CONTEUDO_AJUSTES", conteudoReprovacao: veredito }));
    expect(c.primary).toMatchObject({ action: "reconhecer_ajustes_conteudo" });
  });

  it("em ajustes: sem arquivo novo pede a nova versão (reenviar sem arquivo é secundário); com arquivo novo, enviar", () => {
    const antigo = anexo({ criadoEmTs: "2026-10-05T10:00:00.000Z" });
    const semNovo = entregaFocus(
      ent({ stage: "ROTEIRO_PRODUCAO", roteiroReprovacao: veredito, anexos: [antigo] }),
    );
    expect(semNovo).toMatchObject({
      title: "Roteiro em ajustes",
      semArquivoNovo: true,
      primary: { kind: "nova_versao", label: "Adicionar nova versão", categoria: "Roteiro" },
      secondary: { label: "Reenviar sem arquivo novo", action: "enviar_roteiro" },
    });

    const novo = anexo({ criadoEmTs: "2026-10-05T17:00:00.000Z", versao: 2 });
    const comNovo = entregaFocus(
      ent({ stage: "ROTEIRO_PRODUCAO", roteiroReprovacao: veredito, anexos: [antigo, novo] }),
    );
    expect(comNovo).toMatchObject({
      semArquivoNovo: false,
      primary: {
        kind: "ajuste",
        step: "reenviar",
        label: "Enviar para aprovação",
        action: "enviar_roteiro",
      },
    });
    expect(comNovo.secondary).toBeUndefined();
  });

  it("em ajustes sem nenhum arquivo (foi removido) volta ao fluxo normal: adicionar", () => {
    const f = entregaFocus(ent({ stage: "ROTEIRO_PRODUCAO", roteiroReprovacao: veredito }));
    expect(f.primary).toMatchObject({ kind: "upload", action: "anexar_roteiro" });
  });

  it("reenviado → espera o cliente (sem botão principal)", () => {
    const f = entregaFocus(
      ent({ stage: "ROTEIRO_APROVACAO", roteiroReprovacao: veredito, anexos: [anexo()] }),
    );
    expect(f.primary).toBeUndefined();
    expect(f.title).toContain("reenviado");
    expect(f.openCategoria).toBe("Roteiro");
  });

  it("conteúdo final: adicionar → enviar; aprovado → marcar como publicado", () => {
    expect(entregaFocus(ent({ stage: "PRODUCAO" })).primary).toMatchObject({
      kind: "upload",
      categoria: "Conteúdo final",
    });
    expect(
      entregaFocus(ent({ stage: "PRODUCAO", anexos: [anexo({ categoria: "Conteúdo final" })] }))
        .primary,
    ).toMatchObject({ kind: "engine", action: "enviar_conteudo" });
    expect(entregaFocus(ent({ stage: "PUBLICACAO" }))).toMatchObject({
      tone: "ok",
      primary: { kind: "engine", action: "marcar_publicado" },
    });
  });

  it("publicada: a mesma superfície vira 'Publicação' (data, métricas e o post)", () => {
    const base = {
      stage: "PUBLICADA" as const,
      status: "publicado" as const,
      publicadoEm: "2026-10-04",
    };
    const comLink = entregaFocus(
      ent({
        ...base,
        url: "https://instagram.com/reel/abc",
        metrics: { views: 5_200_000, likes: 98_000 },
      }),
    );
    expect(comLink).toMatchObject({
      rotulo: "Publicação",
      title: "Publicada em 04 out",
      tone: "ok",
      primary: { kind: "post", url: "https://instagram.com/reel/abc" },
    });
    expect(comLink.hint).toContain("views");
    const semLink = entregaFocus(ent(base));
    expect(semLink.hint).toBe("Sem métricas ainda.");
    expect(semLink.primary).toMatchObject({ kind: "publicacao" });
  });

  it("estágio de ajustes movido na mão (sem carimbo do cliente) ainda oferece o passo do motor", () => {
    const f = entregaFocus(ent({ stage: "ROTEIRO_AJUSTES" }));
    expect(f.primary).toMatchObject({ kind: "engine", action: "reconhecer_ajustes_roteiro" });
  });
});

describe("progresso", () => {
  it("estado real por fase, com a data de cada uma", () => {
    const { steps, tone } = entregaStepper(
      ent({
        stage: "PRODUCAO",
        dataRecebimentoRoteiro: "2026-10-05",
        dataRecebimentoConteudo: "2026-10-09",
        dataPostagem: "2026-10-14",
      }),
    );
    expect(steps.map((s) => s.state)).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(steps.map((s) => s.date)).toEqual(["2026-10-05", "2026-10-09", "2026-10-14", undefined]);
    expect(tone).toBe("progress");
  });

  it("publicada = tudo concluído, com a data de publicação na última etapa", () => {
    const { steps, tone } = entregaStepper(
      ent({ stage: "PUBLICADA", status: "publicado", publicadoEm: "2026-10-12" }),
    );
    expect(steps.every((s) => s.state === "done")).toBe(true);
    expect(steps[3].date).toBe("2026-10-12");
    expect(tone).toBe("ok");
  });

  it("fases agrupam os estágios do motor", () => {
    expect(entregaFaseColuna("ROTEIRO_AJUSTES")).toBe("ROTEIRO");
    expect(entregaFaseColuna("CONTEUDO_APROVACAO")).toBe("CONTEUDO");
    expect(entregaFaseColuna("PUBLICACAO")).toBe("PUBLICACAO");
    expect(entregaFaseColuna("PUBLICADA")).toBe("CONCLUIDO");
  });

  it("atraso só vale para a publicação planejada que já passou e não foi publicada", () => {
    const hoje = "2026-10-05";
    expect(publicacaoAtrasoDias(ent({ dataPostagem: "2026-10-02" }), hoje)).toBe(3);
    expect(publicacaoAtrasoDias(ent({ dataPostagem: "2026-10-04" }), hoje)).toBe(1);
    expect(publicacaoAtrasoDias(ent({ dataPostagem: "2026-10-05" }), hoje)).toBeNull();
    expect(publicacaoAtrasoDias(ent({ dataPostagem: "2026-10-14" }), hoje)).toBeNull();
    expect(publicacaoAtrasoDias(ent(), hoje)).toBeNull();
    expect(
      publicacaoAtrasoDias(ent({ dataPostagem: "2026-10-02", stage: "PUBLICADA" }), hoje),
    ).toBeNull();
  });

  it("formatação curta de data e de unidades", () => {
    expect(formatDiaMes("2026-10-05")).toBe("05 out");
    expect(formatDiaMes(undefined)).toBe("");
    expect(entregaUnidadesLabel(ent())).toBe("1 unidade");
    expect(entregaUnidadesLabel(ent({ quantidade: 3 }))).toBe("3 unidades");
    expect(entregaUnidadesLabel(ent({ grupoId: "g" }))).toBeNull();
  });
});

describe("arquivos", () => {
  it("agrupa por categoria na ordem fixa; versão atual separada das anteriores", () => {
    const g = agruparAnexos([
      anexo({ id: "o", categoria: "Outro", nome: "legenda.txt" }),
      anexo({ id: "r1", categoria: "Roteiro", versao: 1 }),
      anexo({ id: "r2", categoria: "Roteiro", versao: 2 }),
      anexo({ id: "c1", categoria: "Conteúdo final", nome: "a.mp4" }),
      anexo({ id: "c2", categoria: "Conteúdo final", nome: "b.mp4" }),
    ]);
    expect(g.map((x) => x.categoria)).toEqual(["Roteiro", "Conteúdo final", "Outro"]);
    expect(g[0].atual.versao).toBe(2);
    expect(g[0].atual.anexos.map((a) => a.id)).toEqual(["r2"]);
    expect(g[0].anteriores.map((v) => v.versao)).toEqual([1]);
    // sem `versao` = v1: os dois são irmãos da mesma versão
    expect(g[1].atual.anexos).toHaveLength(2);
    expect(g[1].anteriores).toEqual([]);
  });

  it("categoria antiga vira Conteúdo final; sem arquivos → nenhum grupo", () => {
    const g = agruparAnexos([anexo({ categoria: "Conteúdo publicado" as never })]);
    expect(g[0].categoria).toBe("Conteúdo final");
    expect(agruparAnexos(undefined)).toEqual([]);
  });

  it("tipo de arquivo pelo nome", () => {
    expect(arquivoTipo("a.JPG")).toBe("imagem");
    expect(arquivoTipo("reels.mp4")).toBe("video");
    expect(arquivoTipo("roteiro.pdf")).toBe("pdf");
    expect(arquivoTipo("legenda.txt")).toBe("texto");
    expect(arquivoTipo("x.zip")).toBe("outro");
  });
});

describe("quadrados de material", () => {
  it("sempre Roteiro, Gravação, Conteúdo final e Legenda; vazio = 'Adicionar'", () => {
    const t = tilesDaEntrega({});
    expect(t.map((x) => x.key)).toEqual(["Roteiro", "Gravação", "Conteúdo final", "Legenda"]);
    expect(t.every((x) => x.vazio && x.estado === "Adicionar")).toBe(true);
  });

  it("estado: V2 · atual, vários arquivos na versão atual, legenda adicionada", () => {
    const t = tilesDaEntrega({
      anexos: [
        anexo({ categoria: "Roteiro", versao: 1 }),
        anexo({ categoria: "Roteiro", versao: 2 }),
        anexo({ categoria: "Conteúdo final", nome: "a.mp4" }),
        anexo({ categoria: "Conteúdo final", nome: "b.mp4" }),
        anexo({ categoria: "Conteúdo final", nome: "c.mp4" }),
      ],
      legenda: "Texto",
    });
    const por = Object.fromEntries(t.map((x) => [x.key, x]));
    expect(por["Roteiro"]).toMatchObject({
      estado: "V2 · atual",
      versaoAtual: 2,
      totalVersoes: 2,
      vazio: false,
    });
    expect(por["Conteúdo final"]).toMatchObject({
      estado: "3 arquivos · V1",
      estadoCurto: "3 arq. · V1",
      totalVersoes: 1,
    });
    // com um arquivo só, o texto curto é o mesmo
    expect(por["Roteiro"]?.estadoCurto).toBe(por["Roteiro"]?.estado);
    expect(por["Conteúdo final"].atual).toHaveLength(3);
    expect(por["Gravação"].vazio).toBe(true);
    expect(por["Legenda"]).toMatchObject({ vazio: false, estado: "Adicionada", tipo: "legenda" });
  });

  it("'Outros arquivos' só aparece com arquivo; o ajuste pedido marca o quadrado", () => {
    expect(tilesDaEntrega({}).some((x) => x.key === "Outro")).toBe(false);
    const t = tilesDaEntrega({ anexos: [anexo({ categoria: "Outro", nome: "x.zip" })] }, "Roteiro");
    expect(t.map((x) => x.key).at(-1)).toBe("Outro");
    expect(t.find((x) => x.key === "Outro")?.label).toBe("Outros arquivos");
    expect(t.find((x) => x.key === "Roteiro")?.atencao).toBe(true);
    expect(t.find((x) => x.key === "Gravação")?.atencao).toBe(false);
  });

  it("substituir troca o arquivo NO LUGAR (mesma versão e posição), sem criar versão", () => {
    const base = [
      anexo({ id: "r1", categoria: "Roteiro", versao: 1, nome: "v1.pdf" }),
      anexo({ id: "r2", categoria: "Roteiro", versao: 2, nome: "v2.pdf" }),
    ];
    const agora = new Date("2026-10-06T15:30:00.000Z");
    const next = substituirArquivo(
      base,
      "r2",
      { nome: "v2-corrigido.pdf", url: "https://x/c.pdf" },
      agora,
    );
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(base[0]);
    expect(next[1]).toMatchObject({
      nome: "v2-corrigido.pdf",
      url: "https://x/c.pdf",
      versao: 2,
      categoria: "Roteiro",
      criadoEmTs: "2026-10-06T15:30:00.000Z",
    });
    expect(next[1].id).not.toBe("r2");
    expect(versaoDoAnexo({})).toBe(1);
  });

  it("remover versão tira só aquela versão daquela categoria; a anterior passa a ser a atual", () => {
    const base = [
      anexo({ id: "r1", categoria: "Roteiro", versao: 1 }),
      anexo({ id: "r2", categoria: "Roteiro", versao: 2 }),
      anexo({ id: "r3", categoria: "Roteiro", versao: 2 }),
      anexo({ id: "c1", categoria: "Conteúdo final", versao: 2 }),
    ];
    const next = removerVersao(base, "Roteiro", 2);
    expect(next.map((a) => a.id)).toEqual(["r1", "c1"]);
    expect(tilesDaEntrega({ anexos: next }).find((x) => x.key === "Roteiro")?.estado).toBe(
      "V1 · atual",
    );
  });
});

describe("legenda, métricas e histórico", () => {
  it("canal da legenda a partir da rede", () => {
    expect(legendaCanal("Instagram")).toBe("instagram");
    expect(legendaCanal("TikTok")).toBe("tiktok");
    expect(legendaCanal("Twitter")).toBe("x");
    expect(legendaCanal("Kwai")).toBe("outro");
    expect(legendaCanal(undefined)).toBe("outro");
  });

  it("resumo só com as métricas preenchidas", () => {
    expect(metricasResumo(undefined)).toEqual([]);
    expect(metricasResumo({})).toEqual([]);
    const r = metricasResumo({ views: 5_200_000, likes: 98_000, saves: 0 });
    expect(r).toHaveLength(3);
    expect(r[0]).toContain("views");
    expect(r[1]).toContain("curtidas");
  });

  it("histórico: por entregaId (e por tipo só nos eventos antigos), mais recente primeiro", () => {
    const act = (id: string, action: string, createdAt: string, entregaId?: string) =>
      ({
        id,
        author: "Toni",
        initials: "T",
        color: "",
        action,
        entregaId,
        createdAt,
      }) as InfluActivity;
    const h = historicoDaEntrega(
      [
        act("1", "anexou o roteiro", "2026-10-05T10:00:00Z", "e1"),
        act("2", "enviou o roteiro", "2026-10-05T11:00:00Z", "e1"),
        act("3", "anexou o roteiro", "2026-10-05T12:00:00Z", "outra"),
        act("4", 'moveu "Reels" pra Conteúdo', "2026-10-05T09:00:00Z"),
        act("5", "mudou status", "2026-10-05T13:00:00Z"),
      ],
      { id: "e1", tipo: "Reels" },
    );
    expect(h.map((a) => a.id)).toEqual(["2", "1", "4"]);
  });

  it("texto do histórico sem o sufixo da entrega e sem repetir o motivo do feedback", () => {
    expect(historicoTexto('enviou o roteiro pra aprovação do cliente — "Reels"')).toBe(
      "enviou o roteiro pra aprovação do cliente",
    );
    expect(historicoTexto("solicitou ajustes em o roteiro de uma entrega — Trocar a trilha")).toBe(
      "solicitou ajustes no roteiro",
    );
    expect(historicoTexto("anexou o roteiro")).toBe("anexou o roteiro");
  });
});

describe("link do post", () => {
  it("só vira link o que é http(s) ou domínio; nunca esquemas perigosos nem texto solto", () => {
    expect(linkDoPost("https://instagram.com/reel/abc")).toBe("https://instagram.com/reel/abc");
    expect(linkDoPost("instagram.com/reel/abc")).toBe("https://instagram.com/reel/abc");
    expect(linkDoPost("  http://x.com ")).toBe("http://x.com");
    expect(linkDoPost("javascript:alert(1)")).toBeNull();
    expect(linkDoPost("link do post")).toBeNull();
    expect(linkDoPost("")).toBeNull();
    expect(linkDoPost(undefined)).toBeNull();
  });
});
