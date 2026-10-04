import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatActivityWhen, type DemoTimelineEntry } from "@/lib/demo/demo-timeline";
import { DemoActivityList } from "./DemoActivityList";

const entries: DemoTimelineEntry[] = [
  {
    id: "1",
    at: "2026-10-05T15:30:00.000Z",
    actor: "cliente",
    text: "Cliente reprovou Beatriz Costa",
    detail: "Público incompatível",
  },
  {
    id: "2",
    at: "2026-10-05T12:00:00.000Z",
    actor: "equipe",
    text: "Time enviou Mariana Alves ao cliente",
  },
  { id: "3", at: "2026-10-05T09:00:00.000Z", actor: "sistema", text: "Demonstração criada" },
];

describe("DemoActivityList", () => {
  it("lista as frases, o detalhe e quem fez, na ordem recebida", () => {
    const html = renderToStaticMarkup(<DemoActivityList entries={entries} />);
    const order = [
      "Cliente reprovou Beatriz Costa",
      "Time enviou Mariana Alves ao cliente",
      "Demonstração criada",
    ].map((t) => html.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Público incompatível");
    expect(html).toContain("Cliente ·");
    expect(html).toContain("Time ·");
    expect(html).toContain("Sistema ·");
  });

  it("vazio: explica o que aparecerá aqui", () => {
    const html = renderToStaticMarkup(<DemoActivityList entries={[]} />);
    expect(html).toContain("Nada aconteceu ainda");
    expect(html).not.toContain("<ul");
  });

  it("texto longo quebra em vez de estourar o painel", () => {
    const html = renderToStaticMarkup(<DemoActivityList entries={entries} />);
    expect(html).toContain("[overflow-wrap:anywhere]");
  });
});

describe("formatActivityWhen", () => {
  it("dd/mm hh:mm no fuso de Brasília", () => {
    expect(formatActivityWhen("2026-10-05T15:30:00.000Z")).toMatch(/05\/10.*12:30/);
    expect(formatActivityWhen("2026-10-06T02:00:00.000Z")).toMatch(/05\/10.*23:00/);
  });
  it("inválido vira travessão", () => {
    expect(formatActivityWhen("lixo")).toBe("—");
  });
});
