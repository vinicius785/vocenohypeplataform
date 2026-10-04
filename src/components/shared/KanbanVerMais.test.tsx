import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KanbanVerMais } from "./KanbanVerMais";
import { KANBAN_COLUMN_LIMIT, splitColumn } from "@/lib/kanban-limit";

describe("splitColumn", () => {
  it("mostra no máximo 4 e informa quantos ficam no Ver mais, sem perder nenhum", () => {
    const items = Array.from({ length: 11 }, (_, i) => i);
    const { visible, hiddenCount } = splitColumn(items);
    expect(visible).toEqual([0, 1, 2, 3]);
    expect(hiddenCount).toBe(7);
    expect(visible.length + hiddenCount).toBe(items.length);
  });
  it("não esconde nada com 4 ou menos", () => {
    expect(splitColumn([1, 2, 3, 4]).hiddenCount).toBe(0);
    expect(splitColumn([]).visible).toEqual([]);
    expect(KANBAN_COLUMN_LIMIT).toBe(4);
  });
});

describe("KanbanVerMais", () => {
  it("renderiza 'Ver mais (N)' só quando há excedente", () => {
    const withHidden = renderToStaticMarkup(
      <KanbanVerMais hiddenCount={3} title="Etapa" total={7}>
        {() => null}
      </KanbanVerMais>,
    );
    expect(withHidden).toContain("Ver mais (3)");
    const none = renderToStaticMarkup(
      <KanbanVerMais hiddenCount={0} title="Etapa" total={4}>
        {() => null}
      </KanbanVerMais>,
    );
    expect(none).toBe("");
  });
});
