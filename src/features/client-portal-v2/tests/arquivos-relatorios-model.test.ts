import { describe, expect, it } from "vitest";
import {
  availableTypeFilters,
  buildFileRows,
  filterFiles,
  hasActiveFileFilter,
  NO_FILE_FILTERS,
  type FileRow,
} from "../lib/arquivos-model";
import {
  competenceLabel,
  dateBR,
  filterAndSortReports,
  groupByMonth,
  type ReportRow,
} from "../lib/relatorios-model";

const f = (id: string, nome: string, extra: Partial<FileRow> = {}): FileRow => ({
  id,
  nome,
  categoria: "Briefing",
  campanhaId: "c1",
  campanhaNome: "Rodonaves Express",
  url: `https://x/${nome}?token=1`,
  ...extra,
});

const files = [
  f("1", "Métricas - Rodonaves.pdf", { categoria: "Relatório" }),
  f("2", "Foto produto.png", { categoria: "Entrega", campanhaId: "c2", campanhaNome: "Verão" }),
  f("3", "Vídeo final.mp4", { categoria: "Entrega", campanhaId: "c2", campanhaNome: "Verão" }),
  f("4", "Briefing geral.pdf"),
];

describe("filtros de Arquivos", () => {
  it("sem filtros devolve tudo; hasActiveFileFilter reflete o estado", () => {
    expect(filterFiles(files, NO_FILE_FILTERS)).toHaveLength(4);
    expect(hasActiveFileFilter(NO_FILE_FILTERS)).toBe(false);
    expect(hasActiveFileFilter({ ...NO_FILE_FILTERS, query: " x " })).toBe(true);
  });
  it("busca ignora acento e caixa", () => {
    const r = filterFiles(files, { ...NO_FILE_FILTERS, query: "METRICAS" });
    expect(r.map((x) => x.id)).toEqual(["1"]);
  });
  it("busca, campanha e tipo valem juntos (E)", () => {
    expect(
      filterFiles(files, { query: "metricas", campaignId: "c1", type: "documentos" }).map(
        (x) => x.id,
      ),
    ).toEqual(["1"]);
    expect(
      filterFiles(files, { query: "metricas", campaignId: "c2", type: "documentos" }),
    ).toHaveLength(0);
  });
  it("tipo: imagens, vídeos, relatórios", () => {
    expect(filterFiles(files, { ...NO_FILE_FILTERS, type: "imagens" }).map((x) => x.id)).toEqual([
      "2",
    ]);
    expect(filterFiles(files, { ...NO_FILE_FILTERS, type: "videos" }).map((x) => x.id)).toEqual([
      "3",
    ]);
    expect(filterFiles(files, { ...NO_FILE_FILTERS, type: "relatorios" }).map((x) => x.id)).toEqual(
      ["1"],
    );
  });
  it("tipos disponíveis vêm só do que existe", () => {
    const s = availableTypeFilters(files);
    expect(s.has("documentos") && s.has("imagens") && s.has("videos")).toBe(true);
    expect(s.has("audios")).toBe(false);
  });
});

describe("buildFileRows", () => {
  it("agrega briefing, anexos e relatórios com url; ignora relatório sem url", () => {
    const rows = buildFileRows({
      campanhas: [
        {
          id: "c1",
          nome: "C1",
          influencers: [
            {
              id: "i1",
              nome: "Inf",
              briefingAnexoUrl: "https://x/b.pdf",
              briefingAnexoNome: "Brief.pdf",
              entregas: [
                {
                  anexos: [
                    {
                      id: "a1",
                      nome: "A.png",
                      categoria: "Arte",
                      url: "https://x/a.png",
                      criadoEm: "2026-01-01",
                    },
                  ],
                },
              ],
            },
          ],
          relatorios: [
            { id: "r1", nome: "R.pdf", url: "https://x/r.pdf", uploadedAt: "2026-02-01" },
            { id: "r2", nome: "Sem", url: null, uploadedAt: "2026-02-01" },
          ],
        },
      ],
    } as never);
    expect(rows.map((r) => r.id)).toEqual(["briefing:i1", "anexo:a1", "relatorio:r1"]);
  });
});

const r = (id: string, mes: string, up: string, camp = "A", cid = "c1"): ReportRow => ({
  id,
  campanhaId: cid,
  campanhaNome: camp,
  nome: id,
  mes,
  uploadedAt: up,
  url: "u",
});

describe("Relatórios", () => {
  const list = [
    r("a", "2026-08", "2026-08-30"),
    r("b", "2026-09", "2026-09-23", "B", "c2"),
    r("c", "2026-09", "2026-09-02"),
  ];
  it("ordena e filtra por campanha", () => {
    expect(filterAndSortReports(list, "todas", "recentes").map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(filterAndSortReports(list, "todas", "antigos").map((x) => x.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(filterAndSortReports(list, "c2", "recentes").map((x) => x.id)).toEqual(["b"]);
    expect(filterAndSortReports(list, "todas", "campanha")[2].campanhaNome).toBe("B");
  });
  it("agrupa por mês na ordem da lista", () => {
    const g = groupByMonth(filterAndSortReports(list, "todas", "recentes"));
    expect(g.map(([m, items]) => [m, items.length])).toEqual([
      ["2026-09", 2],
      ["2026-08", 1],
    ]);
  });
  it("rótulos", () => {
    expect(competenceLabel("2026-09")).toBe("Setembro de 2026");
    expect(competenceLabel("lixo")).toBe("lixo");
    expect(dateBR(undefined)).toBeUndefined();
    expect(dateBR("não é data")).toBeUndefined();
  });
});
