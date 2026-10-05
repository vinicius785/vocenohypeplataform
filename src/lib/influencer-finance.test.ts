import { describe, expect, it } from "vitest";
import type { PagamentoEntrega } from "@/lib/influencer-model";
import {
  bankFields,
  contratoInfo,
  hasBankData,
  paymentState,
  paymentTone,
  remuneracaoSummary,
} from "./influencer-finance";

const pag = (o: Partial<PagamentoEntrega> = {}): PagamentoEntrega => ({
  tipos: ["Valor"],
  config: { Valor: { valor: "2500" } },
  aprovacao: "pendente",
  ...o,
});
const TODAY = "2026-10-05";

describe("estado do pagamento", () => {
  it("sem remuneração → não iniciado", () => {
    expect(paymentState(undefined, undefined, TODAY).key).toBe("nao_iniciado");
    expect(paymentState(pag({ tipos: [] }), undefined, TODAY).key).toBe("nao_iniciado");
  });
  it("solicitação pendente / recusada (a aprovação ainda não lançou nada)", () => {
    expect(paymentState(pag(), undefined, TODAY)).toMatchObject({ key: "pendente", amount: 2500 });
    expect(paymentState(pag({ aprovacao: "recusado" }), undefined, TODAY).key).toBe("recusado");
  });
  it("aprovado: agendado, vencido, pago ou cancelado conforme o Financeiro", () => {
    const ok = pag({ aprovacao: "aceito", data: "2026-10-15" });
    expect(paymentState(ok, undefined, TODAY).key).toBe("agendado");
    expect(
      paymentState(pag({ aprovacao: "aceito", data: "2026-10-01" }), undefined, TODAY).key,
    ).toBe("vencido");
    const pago = paymentState(ok, { status: "pago", paidOn: "2026-10-04" }, TODAY);
    expect(pago).toMatchObject({ key: "pago", paidOn: "2026-10-04" });
    expect(paymentState(ok, { status: "cancelado" }, TODAY).key).toBe("cancelado");
  });
  it("pago vale mesmo com vencimento já passado", () => {
    const ok = pag({ aprovacao: "aceito", data: "2026-10-01" });
    expect(paymentState(ok, { status: "pago", paidOn: "2026-10-02" }, TODAY).key).toBe("pago");
  });
});

describe("remuneração", () => {
  it("valor fechado", () => {
    const r = remuneracaoSummary(pag())!;
    expect(r.total).toBe(2500);
    expect(r.tipoLabel).toBe("Valor fechado");
    expect(r.lines[0].label).toBe("Valor fechado");
  });
  it("modalidades combinadas, permuta sem valor em caixa", () => {
    const r = remuneracaoSummary(
      pag({
        tipos: ["Valor", "Permuta"],
        config: { Valor: { valor: "1000" }, Permuta: { permutaDescricao: "Kit de produtos" } },
      }),
    )!;
    expect(r.total).toBe(1000);
    expect(r.tipoLabel).toBe("Valor fechado + Permuta");
    expect(r.lines.map((l) => l.label)).toEqual(["Valor fechado", "Permuta"]);
  });
  it("só permuta: sem total", () => {
    const r = remuneracaoSummary(
      pag({ tipos: ["Permuta"], config: { Permuta: { permutaDescricao: "Kit" } } }),
    )!;
    expect(r.total).toBeNull();
  });
  it("sem remuneração → null", () => {
    expect(remuneracaoSummary(undefined)).toBeNull();
  });
});

describe("dados para pagamento e contrato", () => {
  it("só os campos preenchidos, com PIX e tipo de chave", () => {
    const f = bankFields({
      titular: "Ana",
      banco: "Nubank",
      pixChave: "ana@x.com",
      pixTipo: "email",
      tipoConta: "corrente",
    });
    expect(f.map((x) => x.label)).toEqual(["Titular", "Banco", "Tipo", "PIX"]);
    expect(f.at(-1)?.value).toBe("ana@x.com (E-mail)");
  });
  it("detecta se há dado bancário", () => {
    expect(hasBankData({})).toBe(false);
    expect(hasBankData({ banco: " " })).toBe(false);
    expect(hasBankData({ conta: "123" })).toBe(true);
  });
  it("contrato: ausente, data URL de PDF, URL com nome", () => {
    expect(contratoInfo(undefined).present).toBe(false);
    expect(contratoInfo("data:application/pdf;base64,AAA")).toMatchObject({
      present: true,
      kind: "pdf",
      name: "Contrato (PDF)",
    });
    expect(contratoInfo("https://x/c.pdf", "Contrato_Influenciador.pdf")).toMatchObject({
      kind: "pdf",
      name: "Contrato_Influenciador.pdf",
    });
  });
});

describe("tom do pagamento", () => {
  it("cor só para estado: pago verde, pendente âmbar, vencido/recusado vermelho", () => {
    expect(paymentTone("pago")).toBe("ok");
    expect(paymentTone("pendente")).toBe("pending");
    expect(paymentTone("vencido")).toBe("alert");
    expect(paymentTone("recusado")).toBe("alert");
    expect(paymentTone("agendado")).toBe("info");
    expect(paymentTone("nao_iniciado")).toBe("neutral");
    expect(paymentTone("cancelado")).toBe("neutral");
  });
});
