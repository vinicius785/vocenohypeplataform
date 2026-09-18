import { describe, expect, it } from "vitest";
import { renderMarkdownLite } from "./markdown";

describe("renderMarkdownLite — formatação normal (caso positivo)", () => {
  it("continua convertendo títulos, ênfase, listas e links http(s) normalmente", () => {
    const html = renderMarkdownLite(
      "# Título\n\nUm **negrito** e um *itálico*.\n\n- item 1\n- item 2\n\n[Ver campanha](https://vocenohype.com.br/campanha)",
    );
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<strong>negrito</strong>");
    expect(html).toContain("<em>itálico</em>");
    expect(html).toContain("<li>item 1</li>");
    expect(html).toContain('<a href="https://vocenohype.com.br/campanha"');
  });
});

describe("renderMarkdownLite — segurança (achado da auditoria: XSS armazenado)", () => {
  it("nunca deixa aspas cruas quebrarem o atributo href (auditoria de segurança 2026-09)", () => {
    const html = renderMarkdownLite('[x]("onmouseover="alert(1))');
    // A aspa dupla precisa vir escapada — nunca deve aparecer um atributo
    // extra (onmouseover=) fora da string href="...".
    expect(html).not.toMatch(/onmouseover=/);
  });

  it("rejeita esquemas de URL diferentes de http(s), como javascript:", () => {
    const html = renderMarkdownLite("[clique aqui](javascript:alert(document.cookie))");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
  });

  it("rejeita esquema data: (poderia embutir HTML/script via data URI)", () => {
    const html = renderMarkdownLite("[abrir](data:text/html,<script>alert(1)</script>)");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<script>");
  });

  it("nunca produz uma tag <script> mesmo com entrada tentando injetar uma diretamente", () => {
    const html = renderMarkdownLite("texto normal <script>alert(1)</script> continuação");
    expect(html).not.toContain("<script>");
  });
});
