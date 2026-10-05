import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildMonthCells,
  coerceFormat,
  dayHeading,
  duplicateDraft,
  filterItems,
  groupByDay,
  monthFetchRange,
  monthLabel,
  newDraft,
  overdueDays,
  overdueLabel,
  sortItems,
  validateDraft,
  EMPTY_FILTERS,
  type EditorialItem,
  captionLimit,
  directoryTaskId,
  draftFromItem,
  fileKind,
  formatFileSize,
  rawTaskId,
  taskFromContent,
} from "./marketing-editorial";

const it_ = (o: Partial<EditorialItem>): EditorialItem => ({
  id: "1",
  projetoId: "p",
  titulo: "Reels",
  data: "2026-10-05",
  hora: null,
  canal: "instagram",
  formato: "reels",
  status: "planejado",
  responsavelId: null,
  descricao: null,
  tarefaId: "t1",
  legenda: null,
  arquivos: [],
  ...o,
});

describe("mês", () => {
  it("navega e rotula", () => {
    expect(addMonths("2026-10", 1)).toBe("2026-11");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-10")).toBe("Outubro de 2026");
  });
  it("grade: semanas completas dom–sáb, outubro/2026 (1º é quinta)", () => {
    const cells = buildMonthCells("2026-10");
    expect(cells.length % 7).toBe(0);
    expect(cells[0]).toEqual({ date: "2026-09-27", inMonth: false });
    expect(cells[4]).toEqual({ date: "2026-10-01", inMonth: true });
    expect(cells[cells.length - 1].date).toBe("2026-10-31");
    expect(monthFetchRange("2026-10")).toEqual({ from: "2026-09-27", to: "2026-10-31" });
  });
  it("mês que começa no domingo não ganha semana a mais antes", () => {
    const cells = buildMonthCells("2026-02"); // 1º/fev/2026 é domingo, 28 dias
    expect(cells).toHaveLength(28);
    expect(cells[0].inMonth).toBe(true);
  });
});

describe("atraso (derivado de data + status)", () => {
  it("atrasa só se passou e não está publicado/cancelado", () => {
    expect(overdueDays(it_({ data: "2026-10-03" }), "2026-10-05")).toBe(2);
    expect(overdueDays(it_({ data: "2026-10-05" }), "2026-10-05")).toBe(0);
    expect(overdueDays(it_({ data: "2026-10-03", status: "publicado" }), "2026-10-05")).toBe(0);
    expect(overdueDays(it_({ data: "2026-10-03", status: "cancelado" }), "2026-10-05")).toBe(0);
    expect(overdueDays(it_({ data: "2026-10-09" }), "2026-10-05")).toBe(0);
  });
  it("rótulo", () => {
    expect(overdueLabel(1)).toBe("Atrasado · 1 dia");
    expect(overdueLabel(2)).toBe("Atrasado · 2 dias");
  });
});

describe("ordenação, filtros e agrupamento", () => {
  const a = it_({ id: "a", titulo: "B", hora: "14:00" });
  const b = it_({ id: "b", titulo: "A", hora: "09:00" });
  const c = it_({ id: "c", titulo: "C", hora: null });
  const d = it_({ id: "d", titulo: "D", data: "2026-10-04" });
  it("data, depois horário (sem horário por último)", () => {
    expect(sortItems([a, c, b, d]).map((x) => x.id)).toEqual(["d", "b", "a", "c"]);
  });
  it("agrupa por dia", () => {
    const g = groupByDay([a, b, d]);
    expect([...g.keys()]).toEqual(["2026-10-04", "2026-10-05"]);
    expect(g.get("2026-10-05")!.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("filtra por status, canal, responsável e busca (título/canal/responsável, sem acento)", () => {
    const items = [
      it_({
        id: "1",
        titulo: "Lançamento",
        status: "aprovado",
        canal: "tiktok",
        responsavelId: "m1",
      }),
      it_({
        id: "2",
        titulo: "Bastidores",
        status: "ideia",
        canal: "instagram",
        responsavelId: "m2",
      }),
    ];
    const name = (id: string) => (id === "m1" ? "Vinícius" : "Lucas");
    const ids = (f: Partial<typeof EMPTY_FILTERS>) =>
      filterItems(items, { ...EMPTY_FILTERS, ...f }, name).map((x) => x.id);
    expect(ids({ status: "aprovado" })).toEqual(["1"]);
    expect(ids({ canal: "instagram" })).toEqual(["2"]);
    expect(ids({ responsavelId: "m2" })).toEqual(["2"]);
    expect(ids({ query: "lancamento" })).toEqual(["1"]);
    expect(ids({ query: "tiktok" })).toEqual(["1"]);
    expect(ids({ query: "vinicius" })).toEqual(["1"]);
    expect(ids({})).toEqual(["1", "2"]);
  });
});

describe("formato por canal e rascunhos", () => {
  it("formato incompatível com o canal vira o primeiro do canal", () => {
    expect(coerceFormat("blog", "reels")).toBe("artigo");
    expect(coerceFormat("instagram", "stories")).toBe("stories");
  });
  it("duplicar volta para planejado, sem tarefa, com '(cópia)'", () => {
    const d = duplicateDraft(it_({ status: "publicado", titulo: "X" }));
    expect(d).toMatchObject({
      titulo: "X (cópia)",
      status: "planejado",
      tarefaId: null,
      data: "2026-10-05",
    });
  });
  it("valida título e data", () => {
    expect(validateDraft(newDraft("2026-10-05"))).toBe("Informe o título.");
    expect(validateDraft({ ...newDraft("2026-10-05"), titulo: "Ok" })).toBeNull();
    expect(validateDraft({ ...newDraft(""), titulo: "Ok" })).toBe("Informe a data.");
  });
  it("cabeçalho do dia", () => {
    expect(dayHeading("2026-10-05")).toBe("SEG • 05 OUT");
  });
});

describe("tarefa a partir do conteúdo", () => {
  it("herda título, data, responsável e briefing", () => {
    expect(
      taskFromContent(
        { titulo: " Reels — Lançamento ", data: "2026-10-09", descricao: " Briefing " },
        "Vinícius",
      ),
    ).toEqual({
      title: "Produzir Reels — Lançamento",
      dueDate: "2026-10-09",
      assignees: ["Vinícius"],
      note: "Briefing",
    });
  });
  it("sem responsável e sem briefing", () => {
    const t = taskFromContent({ titulo: "X", data: "2026-10-09", descricao: null });
    expect(t.assignees).toEqual([]);
    expect(t.note).toBeUndefined();
  });
  it("ids do diretório", () => {
    expect(directoryTaskId("abc")).toBe("mkt:abc");
    expect(rawTaskId("mkt:abc")).toBe("abc");
    expect(rawTaskId("xyz")).toBeNull();
  });
  it("rascunho do item não carrega legenda nem arquivos", () => {
    const d = draftFromItem(
      it_({ legenda: "oi", arquivos: [{ id: "1", name: "a", path: "p", size: 1, type: "x" }] }),
    );
    expect(d).not.toHaveProperty("legenda");
    expect(d).not.toHaveProperty("arquivos");
  });
});

describe("legenda e arquivos", () => {
  it("limite só onde é conhecido", () => {
    expect(captionLimit("x")).toBe(280);
    expect(captionLimit("instagram")).toBe(2200);
    expect(captionLimit("blog")).toBeNull();
    expect(captionLimit("facebook")).toBeNull();
  });
  it("tipo e tamanho do arquivo", () => {
    expect(fileKind({ name: "a.MP4", type: "" })).toBe("video");
    expect(fileKind({ name: "a.png", type: "image/png" })).toBe("imagem");
    expect(fileKind({ name: "briefing.pdf", type: "" })).toBe("pdf");
    expect(fileKind({ name: "a.zip", type: "application/zip" })).toBe("outro");
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2.1 * 1024 * 1024)).toBe("2,1 MB");
  });
});
