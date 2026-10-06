import { describe, expect, it } from "vitest";
import {
  agruparAnexos,
  arquivoTipo,
  categoriaEsperada,
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
  it("sem roteiro → adicionar (upload); com roteiro → enviar (motor)", () => {
    const sem = entregaFocus(ent());
    expect(sem).toMatchObject({
      title: "Roteiro pendente",
      tone: "progress",
      primary: { kind: "upload", action: "anexar_roteiro", categoria: "Roteiro" },
    });
    const com = entregaFocus(ent({ anexos: [anexo()] }));
    expect(com?.primary).toMatchObject({ kind: "engine", action: "enviar_roteiro" });
  });

  it("aguardando o cliente → sem botão principal, com link para abrir o arquivo em análise", () => {
    const r = entregaFocus(ent({ stage: "ROTEIRO_APROVACAO", anexos: [anexo()] }));
    expect(r?.primary).toBeUndefined();
    expect(r).toMatchObject({ tone: "waiting", openCategoria: "Roteiro" });
    const c = entregaFocus(ent({ stage: "CONTEUDO_APROVACAO" }));
    expect(c).toMatchObject({ openCategoria: "Conteúdo final" });
  });

  it("ajustes solicitados → a ação do fluxo (editar), tom de ajuste", () => {
    const f = entregaFocus(ent({ stage: "ROTEIRO_AJUSTES", roteiroReprovacao: veredito }));
    expect(f).toMatchObject({
      title: "Ajustes solicitados no roteiro",
      tone: "adjust",
      primary: { kind: "ajuste", step: "editar", action: "reconhecer_ajustes_roteiro" },
    });
    const c = entregaFocus(ent({ stage: "CONTEUDO_AJUSTES", conteudoReprovacao: veredito }));
    expect(c?.title).toBe("Ajustes solicitados no conteúdo final");
  });

  it("em ajustes → reenviar; avisa quando o arquivo não foi atualizado depois do feedback", () => {
    const antigo = anexo({ criadoEmTs: "2026-10-05T10:00:00.000Z" });
    const semNovo = entregaFocus(
      ent({ stage: "ROTEIRO_PRODUCAO", roteiroReprovacao: veredito, anexos: [antigo] }),
    );
    expect(semNovo).toMatchObject({
      title: "Roteiro em ajustes",
      semArquivoNovo: true,
      primary: { kind: "ajuste", step: "reenviar", action: "enviar_roteiro" },
    });
    expect(semNovo?.note).toContain("ainda não foi atualizado");

    const novo = anexo({ criadoEmTs: "2026-10-05T17:00:00.000Z", versao: 2 });
    const comNovo = entregaFocus(
      ent({ stage: "ROTEIRO_PRODUCAO", roteiroReprovacao: veredito, anexos: [antigo, novo] }),
    );
    expect(comNovo).toMatchObject({
      semArquivoNovo: false,
      hint: expect.stringContaining("pronto"),
    });
    expect(comNovo?.note).toBeUndefined();
  });

  it("reenviado → espera o cliente (sem botão principal)", () => {
    const f = entregaFocus(
      ent({ stage: "ROTEIRO_APROVACAO", roteiroReprovacao: veredito, anexos: [anexo()] }),
    );
    expect(f?.primary).toBeUndefined();
    expect(f?.title).toContain("reenviado");
    expect(f?.openCategoria).toBe("Roteiro");
  });

  it("conteúdo final: adicionar → enviar; aprovado → marcar como publicado; publicada → nada", () => {
    expect(entregaFocus(ent({ stage: "PRODUCAO" }))?.primary).toMatchObject({
      kind: "upload",
      categoria: "Conteúdo final",
    });
    expect(
      entregaFocus(ent({ stage: "PRODUCAO", anexos: [anexo({ categoria: "Conteúdo final" })] }))
        ?.primary,
    ).toMatchObject({ kind: "engine", action: "enviar_conteudo" });
    expect(entregaFocus(ent({ stage: "PUBLICACAO" }))).toMatchObject({
      tone: "ok",
      primary: { kind: "engine", action: "marcar_publicado" },
    });
    expect(entregaFocus(ent({ stage: "PUBLICADA" }))).toBeNull();
  });

  it("estágio de ajustes movido na mão (sem carimbo do cliente) ainda oferece o passo do motor", () => {
    const f = entregaFocus(ent({ stage: "ROTEIRO_AJUSTES" }));
    expect(f?.primary).toMatchObject({ kind: "engine", action: "reconhecer_ajustes_roteiro" });
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

  it("categoria esperada agora e tipo de arquivo", () => {
    expect(categoriaEsperada({ stage: "ROTEIRO_APROVACAO" })).toBe("Roteiro");
    expect(categoriaEsperada({ stage: "PRODUCAO" })).toBe("Conteúdo final");
    expect(categoriaEsperada({ stage: "PUBLICACAO" })).toBeNull();
    expect(categoriaEsperada({ stage: "PUBLICADA" })).toBeNull();
    expect(arquivoTipo("a.JPG")).toBe("imagem");
    expect(arquivoTipo("reels.mp4")).toBe("video");
    expect(arquivoTipo("roteiro.pdf")).toBe("pdf");
    expect(arquivoTipo("legenda.txt")).toBe("texto");
    expect(arquivoTipo("x.zip")).toBe("outro");
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
