import { describe, expect, it } from "vitest";
import type { CronogramaItem } from "./campanha-scoped-store";
import {
  agruparPorDia,
  barrasDaSemana,
  ehPeriodo,
  fimDe,
  validarPeriodo,
  celulasDoMes,
  cronogramaPublico,
  duplicarEvento,
  filtrarOcorrencias,
  limitarDia,
  novoEvento,
  ocorrenciasDaGrade,
  ocorrenciasDoMes,
  tipoDe,
  visivelAoCliente,
} from "./campanha-calendario";

const ev = (o: Partial<CronogramaItem>): CronogramaItem => ({
  id: o.id ?? "x",
  date: "2026-10-14",
  title: "Evento",
  ...o,
});

describe("criação, edição e duplicação", () => {
  it("evento novo nasce INTERNO e com autor/datas; título é aparado", () => {
    const e = novoEvento(
      { title: "  Gravação ", date: "2026-10-14", hora: "15:00" },
      "Toni",
      new Date("2026-10-06T10:00:00Z"),
    );
    expect(e.visivelCliente).toBe(false);
    expect(e).toMatchObject({
      title: "Gravação",
      hora: "15:00",
      tipo: "cronograma",
      criadoPor: "Toni",
      criadoEm: "2026-10-06T10:00:00.000Z",
    });
    expect(visivelAoCliente(e)).toBe(false);
  });
  it("marcar 'Mostrar para o cliente' torna visível, sem criar outro registro", () => {
    const e = novoEvento({ title: "A", date: "2026-10-14", visivelCliente: true }, "T");
    expect(visivelAoCliente(e)).toBe(true);
    const editado = { ...e, visivelCliente: false };
    expect(editado.id).toBe(e.id);
    expect(visivelAoCliente(editado)).toBe(false);
  });
  it("duplicar gera id novo, '(cópia)' e volta a ser interno", () => {
    const orig = ev({ id: "1", title: "Reunião", visivelCliente: true });
    const d = duplicarEvento(orig, "Ana");
    expect(d.id).not.toBe("1");
    expect(d.title).toBe("Reunião (cópia)");
    expect(d.visivelCliente).toBe(false);
  });
  it("exclusão = tirar da lista (mesma fonte)", () => {
    const lista = [ev({ id: "1" }), ev({ id: "2" })];
    expect(lista.filter((x) => x.id !== "1").map((x) => x.id)).toEqual(["2"]);
  });
});

describe("mês, dias e muitos eventos", () => {
  const lista = [
    ev({ id: "a", date: "2026-10-05" }),
    ev({ id: "b", date: "2026-11-02" }),
    ev({ id: "c", date: "2026-08-20", recurring: true }),
  ];
  it("troca de mês mostra só o mês (recorrente repete no dia, ajustado ao último dia)", () => {
    expect(
      ocorrenciasDoMes(lista, 2026, 9)
        .map((o) => o.date)
        .sort(),
    ).toEqual(["2026-10-05", "2026-10-20"]);
    expect(
      ocorrenciasDoMes(lista, 2026, 10)
        .map((o) => o.date)
        .sort(),
    ).toEqual(["2026-11-02", "2026-11-20"]);
    const r31 = [ev({ id: "r", date: "2026-08-31", recurring: true })];
    expect(ocorrenciasDoMes(r31, 2026, 8)[0].date).toBe("2026-09-30");
  });
  it("42 células começando no domingo", () => {
    const c = celulasDoMes(2026, 9);
    expect(c).toHaveLength(42);
    expect(new Date(c[0].date + "T00:00:00").getDay()).toBe(0);
    expect(c.filter((x) => x.inMonth)).toHaveLength(31);
  });
  it("agrupa por dia ordenando por horário (sem horário por último) e limita com '+N'", () => {
    const muitos = ["10:00", undefined, "09:00", "11:00", "12:00"].map((h, i) =>
      ev({ id: String(i), date: "2026-10-14", title: `E${i}`, hora: h }),
    );
    const dia = agruparPorDia(ocorrenciasDoMes(muitos, 2026, 9)).get("2026-10-14")!;
    expect(dia.map((o) => o.item.hora ?? "—")).toEqual(["09:00", "10:00", "11:00", "12:00", "—"]);
    const { shown, rest } = limitarDia(dia, 3);
    expect(shown).toHaveLength(3);
    expect(rest).toBe(2);
    expect(limitarDia(dia.slice(0, 2), 3).rest).toBe(0);
  });
});

describe("filtros", () => {
  const occ = ocorrenciasDoMes(
    [
      ev({ id: "i", title: "Reunião interna", visivelCliente: false, tipo: "prazo" }),
      ev({ id: "c", title: "Entrega ao cliente", visivelCliente: true }),
      ev({ id: "l", title: "Antigo sem flag" }),
    ],
    2026,
    9,
  );
  it("Todos | Internos | Cliente", () => {
    expect(filtrarOcorrencias(occ, {}).length).toBe(3);
    expect(filtrarOcorrencias(occ, { visibilidade: "internos" }).map((o) => o.item.id)).toEqual([
      "i",
    ]);
    expect(filtrarOcorrencias(occ, { visibilidade: "cliente" }).map((o) => o.item.id)).toEqual([
      "c",
      "l",
    ]);
  });
  it("busca (título/descrição) e tipo; evento antigo conta como cronograma", () => {
    expect(filtrarOcorrencias(occ, { busca: "reunião" }).map((o) => o.item.id)).toEqual(["i"]);
    expect(filtrarOcorrencias(occ, { tipo: "prazo" }).map((o) => o.item.id)).toEqual(["i"]);
    expect(tipoDe(ev({}))).toBe("cronograma");
  });
});

describe("Portal do Cliente — projeção pública (segurança)", () => {
  const lista = [
    ev({
      id: "int",
      title: "Interno",
      visivelCliente: false,
      criadoPor: "Toni",
      description: "segredo",
    }),
    ev({
      id: "cli",
      title: "Compartilhado",
      visivelCliente: true,
      hora: "10:00",
      tipo: "postagem",
      criadoPor: "Toni",
      atualizadoEm: "2026-10-01",
    }),
    ev({ id: "old", title: "Antigo", date: "2026-08-20" }),
  ];
  it("cliente NÃO vê evento interno; vê compartilhado e o antigo (sempre foi visível)", () => {
    const pub = cronogramaPublico(lista);
    expect(pub.map((p) => p.id)).toEqual(["old", "cli"]);
    expect(JSON.stringify(pub)).not.toContain("segredo");
    expect(JSON.stringify(pub)).not.toContain("Interno");
  });
  it("nenhum campo interno (visibilidade, autor, datas de edição) sai", () => {
    const [p] = cronogramaPublico([lista[1]]);
    expect(Object.keys(p).sort()).toEqual(["date", "hora", "id", "tipo", "title"]);
  });
  it("time vê ambos (a lista completa continua intacta)", () => {
    expect(lista).toHaveLength(3);
    expect(filtrarOcorrencias(ocorrenciasDoMes(lista, 2026, 9), {}).length).toBe(2);
  });
});

describe("grade mostra eventos dos dias adjacentes", () => {
  const grade = (y: number, m0: number) => celulasDoMes(y, m0);
  const datas = (o: { date: string }[]) => o.map((x) => x.date);

  it("evento do mês atual aparece", () => {
    const o = ocorrenciasDaGrade([ev({ date: "2026-11-10" })], grade(2026, 10));
    expect(datas(o)).toEqual(["2026-11-10"]);
  });
  it("02/12 aparece ao ver novembro e 30/09 ao ver outubro (na data real)", () => {
    expect(datas(ocorrenciasDaGrade([ev({ date: "2026-12-02" })], grade(2026, 10)))).toEqual([
      "2026-12-02",
    ]);
    expect(datas(ocorrenciasDaGrade([ev({ date: "2026-09-30" })], grade(2026, 9)))).toEqual([
      "2026-09-30",
    ]);
  });
  it("fora da grade não aparece", () => {
    expect(ocorrenciasDaGrade([ev({ date: "2026-12-20" })], grade(2026, 10))).toEqual([]);
  });
  it("dezembro → janeiro (virada de ano)", () => {
    expect(datas(ocorrenciasDaGrade([ev({ date: "2027-01-02" })], grade(2026, 11)))).toEqual([
      "2027-01-02",
    ]);
    expect(datas(ocorrenciasDaGrade([ev({ date: "2026-12-31" })], grade(2027, 0)))).toEqual([
      "2026-12-31",
    ]);
  });
  it("sem duplicar, inclusive recorrentes", () => {
    const o = ocorrenciasDaGrade(
      [ev({ id: "a", date: "2026-10-02", recurring: true }), ev({ id: "b", date: "2026-12-02" })],
      grade(2026, 10),
    );
    const chaves = o.map((x) => `${x.item.id}@${x.date}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(chaves).toContain("b@2026-12-02");
    expect(chaves).toContain("a@2026-11-02");
  });
  it("filtros Internos/Cliente valem nos dias adjacentes", () => {
    const o = ocorrenciasDaGrade(
      [
        ev({ id: "i", date: "2026-12-02", visivelCliente: false }),
        ev({ id: "c", date: "2026-12-03", visivelCliente: true }),
      ],
      grade(2026, 10),
    );
    expect(filtrarOcorrencias(o, { visibilidade: "internos" }).map((x) => x.item.id)).toEqual([
      "i",
    ]);
    expect(filtrarOcorrencias(o, { visibilidade: "cliente" }).map((x) => x.item.id)).toEqual(["c"]);
  });
  it("vários eventos no dia: limita e informa o resto", () => {
    const itens = Array.from({ length: 6 }, (_, i) => ev({ id: `e${i}`, date: "2026-12-02" }));
    const dia = agruparPorDia(ocorrenciasDaGrade(itens, grade(2026, 10))).get("2026-12-02") ?? [];
    expect(limitarDia(dia, 3)).toMatchObject({ rest: 3 });
  });
});

describe("marcos com período (data de → data até)", () => {
  const sem = (y: number, m0: number, w: number) =>
    celulasDoMes(y, m0)
      .slice(w * 7, w * 7 + 7)
      .map((c) => c.date);
  // Outubro/2026: 1º é quinta; semana 0 = 27/09..03/10, semana 1 = 04..10, semana 2 = 11..17
  const per = (date: string, dataFim: string, extra: Partial<CronogramaItem> = {}) =>
    ev({ id: "p", date, dataFim, ...extra });
  const occ = (item: CronogramaItem) => ({ item, date: item.date });

  it("1 dia (sem fim ou fim igual) não é período", () => {
    expect(ehPeriodo(ev({ date: "2026-10-14" }))).toBe(false);
    expect(ehPeriodo(per("2026-10-14", "2026-10-14"))).toBe(false);
    expect(barrasDaSemana([occ(per("2026-10-14", "2026-10-14"))], sem(2026, 9, 2))).toEqual([]);
  });
  it("2 dias e 7 dias", () => {
    const b2 = barrasDaSemana([occ(per("2026-10-14", "2026-10-15"))], sem(2026, 9, 2));
    expect(b2).toMatchObject([{ col: 3, span: 2, lane: 0 }]);
    const b7 = barrasDaSemana([occ(per("2026-10-11", "2026-10-17"))], sem(2026, 9, 2));
    expect(b7).toMatchObject([{ col: 0, span: 7, continuaAntes: false, continuaDepois: false }]);
  });
  it("começa no domingo e termina no sábado", () => {
    const b = barrasDaSemana([occ(per("2026-10-11", "2026-10-13"))], sem(2026, 9, 2));
    expect(b[0]).toMatchObject({ col: 0, span: 3 });
    const c = barrasDaSemana([occ(per("2026-10-15", "2026-10-17"))], sem(2026, 9, 2));
    expect(c[0]).toMatchObject({ col: 4, span: 3, continuaDepois: false });
  });
  it("atravessa duas semanas: continua na seguinte, sem duplicar identidade", () => {
    const o = occ(per("2026-10-10", "2026-10-18"));
    const s1 = barrasDaSemana([o], sem(2026, 9, 1));
    const s2 = barrasDaSemana([o], sem(2026, 9, 2));
    const s3 = barrasDaSemana([o], sem(2026, 9, 3));
    expect(s1[0]).toMatchObject({ col: 6, span: 1, continuaDepois: true });
    expect(s2[0]).toMatchObject({ col: 0, span: 7, continuaAntes: true, continuaDepois: true });
    expect(s3[0]).toMatchObject({ col: 0, span: 1, continuaAntes: true, continuaDepois: false });
  });
  it("atravessa meses: aparece em outubro e em novembro (grade), uma ocorrência só", () => {
    const item = per("2026-10-28", "2026-11-05");
    const out = ocorrenciasDaGrade([item], celulasDoMes(2026, 9));
    const nov = ocorrenciasDaGrade([item], celulasDoMes(2026, 10));
    expect(out).toHaveLength(1);
    expect(nov).toHaveLength(1);
    expect(nov[0].date).toBe("2026-10-28"); // data real preservada
    expect(ocorrenciasDaGrade([item], celulasDoMes(2026, 11))).toHaveLength(0);
  });
  it("faixas: dois períodos sobrepostos ficam em lanes diferentes", () => {
    const b = barrasDaSemana(
      [
        occ(per("2026-10-12", "2026-10-15", { id: "a" })),
        occ(per("2026-10-14", "2026-10-16", { id: "b" })),
      ],
      sem(2026, 9, 2),
    );
    expect(b.map((x) => x.lane)).toEqual([0, 1]);
  });
  it("interno x cliente: visibilidade continua por evento e vai ao portal com dataFim", () => {
    const interno = per("2026-10-10", "2026-10-12", { id: "i", visivelCliente: false });
    const cliente = per("2026-10-10", "2026-10-12", { id: "c", visivelCliente: true });
    expect(cronogramaPublico([interno, cliente]).map((x) => x.id)).toEqual(["c"]);
    expect(cronogramaPublico([cliente])[0].dataFim).toBe("2026-10-12");
    expect(cronogramaPublico([ev({ id: "d" })])[0]).not.toHaveProperty("dataFim");
  });
  it("edição do início e do fim; fim anterior é inválido", () => {
    const e = novoEvento({ title: "P", date: "2026-10-10", dataFim: "2026-10-18" }, "A");
    expect(fimDe({ ...e, date: "2026-10-12" })).toBe("2026-10-18");
    expect(fimDe({ ...e, dataFim: "2026-10-20" })).toBe("2026-10-20");
    expect(validarPeriodo("2026-10-18", "2026-10-15")).toMatch(/anterior/);
    expect(validarPeriodo("2026-10-10", "2026-10-15")).toBeNull();
    expect(validarPeriodo("2026-10-10", undefined)).toBeNull();
    expect(
      novoEvento({ title: "x", date: "2026-10-18", dataFim: "2026-10-15" }, "A").dataFim,
    ).toBeUndefined();
  });
  it("recorrente nunca vira período", () => {
    expect(ehPeriodo(per("2026-10-10", "2026-10-18", { recurring: true }))).toBe(false);
  });
});
