import { describe, expect, it } from "vitest";
import type { Entry } from "@/lib/financeiro-entries";
import {
  canMarkPaid,
  docGroups,
  entryHistorico,
  entryPhase,
  partialSummary,
  statusLine,
} from "./entry-detail";

const e = (o: Partial<Entry> = {}): Entry =>
  ({
    id: "x",
    date: "2026-11-11",
    vencimento: "2026-11-11",
    competencia: "2026-11-11",
    description: "Pagamento a Mirella Belo",
    category: "Influenciadores",
    amount: 1500,
    kind: "despesa",
    source: "influenciador",
    status: "a_pagar",
    editable: false,
    ...o,
  }) as Entry;

describe("situação do lançamento", () => {
  it("a pagar, vencido, pago, recebido e cancelado", () => {
    expect(statusLine(e())).toBe("Vencimento em 11/11/2026");
    expect(statusLine(e({ status: "vencido" }))).toBe("Venceu em 11/11/2026");
    expect(
      statusLine(
        e({
          status: "pago",
          payment: { pagamento: "2026-11-10", paidAmount: 1500, paymentMethod: "PIX" },
        }),
      ),
    ).toBe("Pago em 10/11/2026");
    expect(statusLine(e({ kind: "receita", status: "recebido" }))).toBe("Recebido");
    expect(statusLine(e({ status: "cancelado" }))).toBe("Cancelado");
  });
  it("só oferece quitar quando está em aberto ou vencido", () => {
    expect(canMarkPaid(e())).toBe(true);
    expect(canMarkPaid(e({ status: "vencido" }))).toBe(true);
    for (const s of ["pago", "recebido", "cancelado"] as const)
      expect(canMarkPaid(e({ status: s }))).toBe(false);
    expect(entryPhase(e({ status: "pago" }))).toBe("quitado");
  });
  it("parcial só quando houve pagamento menor que o valor", () => {
    expect(partialSummary(e())).toBeNull();
    expect(
      partialSummary(
        e({ payment: { pagamento: "2026-11-01", paidAmount: 500, paymentMethod: "PIX" } }),
      ),
    ).toEqual({ paid: 500, remaining: 1000 });
  });
});

describe("documentos", () => {
  it("separa nota fiscal e comprovante, inclusive a nota fiscal antiga (invoice)", () => {
    const g = docGroups({
      invoice: { name: "antiga.pdf", dataUrl: "data:application/pdf;base64,AA==" } as never,
      anexos: [
        { id: "1", categoria: "Nota fiscal", nome: "NF-1.pdf", url: "u1" },
        { id: "2", categoria: "Comprovante", nome: "comp.png", url: "u2" },
      ],
    });
    expect(g.notaFiscal.map((a) => a.nome)).toEqual(["antiga.pdf", "NF-1.pdf"]);
    expect(g.comprovante.map((a) => a.nome)).toEqual(["comp.png"]);
    expect(docGroups({})).toEqual({ notaFiscal: [], comprovante: [] });
  });
});

describe("histórico", () => {
  it("junta pagamento, cobrança, anexos e atividade do influenciador, mais recente primeiro", () => {
    const h = entryHistorico(
      e({
        status: "pago",
        payment: { pagamento: "2026-11-10", paidAmount: 1500, paymentMethod: "PIX" },
        cobrancaHistorico: [{ data: "2026-11-05", nota: "ligou" }],
        anexos: [
          { id: "a", categoria: "Nota fiscal", nome: "NF.pdf", url: "u", criadoEm: "2026-11-02" },
        ],
      }),
      [
        {
          id: "i1",
          action: "definiu o vencimento em 11/11/2026",
          author: "Toni Aversa",
          createdAt: "2026-11-01T17:29:00Z",
        },
      ],
    );
    expect(h.map((x) => x.id)).toEqual(["pagamento", "cobranca-0", "anexo-a", "inf-i1"]);
    expect(h[0].texto).toBe("registrou o pagamento via PIX");
    expect(h[3].autor).toBe("Toni Aversa");
  });
  it("sem nada registrado → vazio (não inventa eventos)", () => {
    expect(entryHistorico(e())).toEqual([]);
  });
});
