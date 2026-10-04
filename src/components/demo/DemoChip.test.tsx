import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEMO_CHIP_LABEL, DemoChip } from "./DemoChip";

describe("DemoChip", () => {
  it("mostra o rótulo e explica o que é, em um único selo suave", () => {
    const html = renderToStaticMarkup(<DemoChip />);
    expect(html).toContain(DEMO_CHIP_LABEL);
    expect(DEMO_CHIP_LABEL).toBe("Ambiente de demonstração");
    expect(html).toContain('title="Dados fictícios, isolados do restante da plataforma."');
    expect(html).toContain("bg-info-soft");
    expect(html).not.toContain("bg-foreground"); // nunca sólido
  });

  it("aceita classes extras sem perder o estilo do selo", () => {
    const html = renderToStaticMarkup(<DemoChip className="ml-2" />);
    expect(html).toContain("ml-2");
    expect(html).toContain("bg-info-soft");
  });
});
