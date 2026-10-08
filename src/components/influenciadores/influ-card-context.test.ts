import { describe, expect, it } from "vitest";
import { pickCardContext } from "./influ-card-context";

const base = { overdueDays: null, producao: null };

describe("contexto do card de influenciador", () => {
  it("em curadoria sem nada relevante: sem linha negativa nem placeholder", () => {
    expect(pickCardContext(base)).toEqual({ primary: null, secondary: null });
  });
  it("aprovado com entregas: progresso de conteúdo", () => {
    expect(pickCardContext({ ...base, producao: { publicadas: 2, total: 3 } }).primary).toEqual({
      kind: "producao",
      publicadas: 2,
      total: 3,
    });
  });
  it("sem entregas cadastradas (total 0) não ocupa espaço", () => {
    expect(pickCardContext({ ...base, producao: { publicadas: 0, total: 0 } }).primary).toBeNull();
  });
  it("não elegível a entregas (producao null) não gera mensagem", () => {
    expect(pickCardContext({ ...base, producao: null }).primary).toBeNull();
  });
  it("aguardando aprovação há X dias tem prioridade sobre o resto", () => {
    const c = pickCardContext({
      overdueDays: 6,
      motivoRecusa: "x",
      producao: { publicadas: 1, total: 2 },
    });
    expect(c.primary).toEqual({ kind: "aguardando", days: 6 });
  });
  it("recusa mostra o motivo", () => {
    expect(pickCardContext({ ...base, motivoRecusa: " fora do perfil " }).primary).toEqual({
      kind: "recusa",
      motivo: "fora do perfil",
    });
  });
  it("secundário: próxima postagem > valor acordado > valor da inscrição", () => {
    expect(
      pickCardContext({ ...base, proximaPostagem: "2026-10-13", totalPago: 100 }).secondary,
    ).toEqual({
      kind: "proxima",
      data: "2026-10-13",
    });
    expect(pickCardContext({ ...base, totalPago: 100, budget: 50 }).secondary).toEqual({
      kind: "valor",
      amount: 100,
      origem: "acordado",
    });
    expect(pickCardContext({ ...base, budget: 50 }).secondary).toEqual({
      kind: "valor",
      amount: 50,
      origem: "inscricao",
    });
  });
  it("valor zero ou ausente nunca vira '—'", () => {
    expect(pickCardContext({ ...base, totalPago: 0, budget: null }).secondary).toBeNull();
  });
});
