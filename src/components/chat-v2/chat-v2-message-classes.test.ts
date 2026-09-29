import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MESSAGE_BODY_CLASS } from "./ChatV2Message";

/**
 * Regressão do bug relatado na rodada do commit `99da98b` ("Chat V2:
 * substitui a composição de mensagens por um modelo real de chat"): uma
 * mensagem curta como "Solicitei lá" quebrava letra por letra, numa coluna
 * estreitíssima. A causa raiz era a combinação `w-fit` (balão que abraça o
 * conteúdo) dentro de um item flex sem `flex-basis`/largura mínima
 * (`flex min-w-0 flex-col`, dentro de um `flex-row-reverse` pra mensagens
 * próprias) — o item podia colapsar pra uma largura mínima, e `break-words`
 * então quebrava a cada caractere pra caber. Esse layout de balão foi
 * removido nesta rodada (ver `ChatV2Message.tsx`), mas este teste garante
 * que os tokens que causaram o bug nunca voltem a aparecer no wrapper/corpo
 * da mensagem, mesmo que o componente seja editado de novo no futuro.
 *
 * Não há infraestrutura de teste de render de componente React configurada
 * neste projeto (`vitest.config.ts` usa `environment: "node"`, sem jsdom, e
 * os únicos testes existentes em `chat-v2/` são sobre funções puras) — um
 * teste de render completo exigiria adicionar jsdom + testing-library só
 * pra este caso, desproporcional ao escopo desta correção. Em vez disso:
 * (1) a classe do corpo do texto é uma constante exportada, verificada
 * diretamente; (2) o arquivo fonte inteiro é varrido por string em busca dos
 * tokens proibidos em qualquer className relacionado a mensagem.
 */
describe("ChatV2Message — classes de texto/wrapper", () => {
  it("MESSAGE_BODY_CLASS nunca usa break-all nem min-content", () => {
    expect(MESSAGE_BODY_CLASS).not.toMatch(/break-all/);
    expect(MESSAGE_BODY_CLASS).not.toMatch(/min-content/);
    // overflow-wrap: break-word (Tailwind `break-words`) é permitido —
    // é o comportamento correto para URLs/palavras longas sem quebrar
    // texto normal caractere a caractere.
    expect(MESSAGE_BODY_CLASS).toMatch(/break-words/);
  });

  it("o arquivo fonte não reintroduz w-fit/break-all/min-content em nenhuma className", () => {
    const path = fileURLToPath(new URL("./ChatV2Message.tsx", import.meta.url));
    const source = readFileSync(path, "utf-8");
    expect(source).not.toMatch(/\bw-fit\b/);
    expect(source).not.toMatch(/\bbreak-all\b/);
    expect(source).not.toMatch(/\bmin-content\b/);
  });
});
