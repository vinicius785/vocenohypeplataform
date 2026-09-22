import { describe, expect, it } from "vitest";
import { findExistingBankInfluMatch, type MatchableInflu } from "./bank-influ-match";

function influ(overrides: Partial<MatchableInflu> = {}): MatchableInflu {
  return {
    nome: "Fulano de Tal",
    redes: [],
    ...overrides,
  };
}

describe("findExistingBankInfluMatch", () => {
  it("detecta a mesma pessoa mesmo com nomes de exibição diferentes (causa real das duplicatas)", () => {
    const current = [influ({ nome: "allan vaz", email: "allan@exemplo.com" })];
    const candidate = influ({ nome: "Allan Neumann Vaz", email: "Allan@Exemplo.com" });
    expect(findExistingBankInfluMatch(candidate, current)).toBe(current[0]);
  });

  it("casa por telefone normalizado (com/sem formatação)", () => {
    const current = [influ({ nome: "Maria", telefone: "(11) 91234-5678" })];
    const candidate = influ({ nome: "Maria Silva", telefone: "11912345678" });
    expect(findExistingBankInfluMatch(candidate, current)).toBe(current[0]);
  });

  it("casa por (plataforma, handle) normalizado, ignorando @ e maiúsculas", () => {
    const current = [
      influ({ nome: "João", redes: [{ id: "r1", plataforma: "Instagram", handle: "@joaosilva" }] }),
    ];
    const candidate = influ({
      nome: "João Silva",
      redes: [{ id: "r2", plataforma: "Instagram", handle: "JoaoSilva" }],
    });
    expect(findExistingBankInfluMatch(candidate, current)).toBe(current[0]);
  });

  it("não casa handles iguais em plataformas diferentes", () => {
    const current = [
      influ({ nome: "João", redes: [{ id: "r1", plataforma: "Instagram", handle: "joaosilva" }] }),
    ];
    const candidate = influ({
      nome: "Outro João",
      redes: [{ id: "r2", plataforma: "TikTok", handle: "joaosilva" }],
    });
    expect(findExistingBankInfluMatch(candidate, current)).toBeNull();
  });

  it("cai pro nome normalizado quando não há e-mail/telefone/rede pra comparar", () => {
    const current = [influ({ nome: "Sem Contato Nenhum" })];
    const candidate = influ({ nome: "  sem contato nenhum  " });
    expect(findExistingBankInfluMatch(candidate, current)).toBe(current[0]);
  });

  it("retorna null quando não há nenhuma coincidência", () => {
    const current = [influ({ nome: "Pessoa A", email: "a@exemplo.com" })];
    const candidate = influ({ nome: "Pessoa B", email: "b@exemplo.com" });
    expect(findExistingBankInfluMatch(candidate, current)).toBeNull();
  });

  it("não deixa e-mail/telefone vazios ('') colidirem entre si", () => {
    const current = [influ({ nome: "Pessoa A", email: "", telefone: "" })];
    const candidate = influ({ nome: "Pessoa B", email: "", telefone: "" });
    expect(findExistingBankInfluMatch(candidate, current)).toBeNull();
  });
});
