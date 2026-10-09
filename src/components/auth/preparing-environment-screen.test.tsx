import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PreparingEnvironmentScreen } from "./PreparingEnvironmentScreen";

describe("PreparingEnvironmentScreen (render do servidor)", () => {
  const html = renderToStaticMarkup(<PreparingEnvironmentScreen />);

  it("anuncia o carregamento por texto, sem depender do vídeo", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Preparando seu ambiente");
  });

  it("não baixa vídeo antes de o cliente saber a orientação; fundo preto sem piscar tela clara", () => {
    expect(html).not.toContain("<video");
    expect(html).toContain("bg-black");
    expect(html).not.toContain("bg-background");
  });
});
