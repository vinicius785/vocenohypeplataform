import { describe, expect, it } from "vitest";
import type { CronogramaItem } from "./campanha-scoped-store";
import {
  agruparPorDia,
  celulasDoMes,
  cronogramaPublico,
  duplicarEvento,
  filtrarOcorrencias,
  limitarDia,
  novoEvento,
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
