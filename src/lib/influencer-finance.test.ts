import { describe, expect, it } from "vitest";
import type { PagamentoEntrega } from "@/lib/influencer-model";
import {
  bankFields,
  contractAttachedAt,
  contratoInfo,
  formatIsoDate,
  notaFiscalAttachedAt,
  notaFiscalInfo,
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

describe("data do contrato", () => {
  it("usa o último evento financeiro 'anexou/substituiu o contrato'", () => {
    const a = (action: string, createdAt: string, area: string = "financeiro") => ({
      action,
      area,
      createdAt,
    });
    expect(contractAttachedAt(undefined)).toBeUndefined();
    expect(
      contractAttachedAt([a("definiu a remuneração em R$ 1,00", "2026-10-01T10:00:00Z")]),
    ).toBeUndefined();
    expect(
      contractAttachedAt([
        a("anexou o contrato", "2026-10-02T10:00:00Z"),
        a("substituiu o contrato", "2026-10-05T10:00:00Z"),
        a("removeu o contrato", "2026-10-06T10:00:00Z"),
      ]),
    ).toBe("2026-10-05T10:00:00Z");
    // sem a marca de área financeira não conta (atividade geral não se mistura)
    expect(
      contractAttachedAt([a("anexou o contrato", "2026-10-02T10:00:00Z", "geral")]),
    ).toBeUndefined();
  });
});

import { financeNextAction, maskTail } from "./influencer-finance";

describe("financeNextAction (uma única ação prioritária)", () => {
  const ok = {
    state: "pendente" as const,
    hasRem: true,
    hasBank: true,
    hasContrato: true,
    showRemPag: true,
    showBank: true,
    showContrato: true,
    canFinanceiro: true,
  };
  it("segue a prioridade", () => {
    expect(financeNextAction({ ...ok, hasRem: false, state: "nao_iniciado" })?.key).toBe(
      "definir_remuneracao",
    );
    expect(financeNextAction({ ...ok, hasBank: false, hasContrato: false })?.key).toBe(
      "cadastrar_banco",
    );
    expect(financeNextAction({ ...ok, hasContrato: false })?.key).toBe("anexar_contrato");
    expect(financeNextAction(ok)?.key).toBe("iniciar_pagamento");
    expect(financeNextAction({ ...ok, state: "recusado" })?.key).toBe("reabrir");
    expect(financeNextAction({ ...ok, state: "vencido", hasBank: false })?.key).toBe(
      "registrar_pagamento",
    );
    expect(financeNextAction({ ...ok, state: "agendado" })?.key).toBe("registrar_pagamento");
  });
  it("sem permissão do Financeiro não há ação de registrar; pago não tem ação", () => {
    expect(financeNextAction({ ...ok, state: "agendado", canFinanceiro: false })).toBeNull();
    expect(financeNextAction({ ...ok, state: "pago" })).toBeNull();
  });
  it("seção escondida no projeto não gera ação", () => {
    expect(
      financeNextAction({
        ...ok,
        hasBank: false,
        showBank: false,
        hasContrato: false,
        showContrato: false,
      })?.key,
    ).toBe("iniciar_pagamento");
  });
});

describe("maskTail", () => {
  it("mostra só o fim", () => {
    expect(maskTail("12345-6789")).toBe("••••6789");
    expect(maskTail("123")).toBe("••••••");
  });
});

describe("nota fiscal (documento financeiro, mesmo padrão do contrato)", () => {
  it("estado vazio e preenchido, com formato e nome", () => {
    expect(notaFiscalInfo(undefined).present).toBe(false);
    expect(notaFiscalInfo("https://x/nf.pdf", "NF-001.pdf")).toEqual({
      present: true,
      name: "NF-001.pdf",
      kind: "pdf",
    });
    expect(notaFiscalInfo("data:image/png;base64,AA==").name).toBe("Nota fiscal (imagem)");
    expect(notaFiscalInfo("https://x/nf.xml", "nf.xml").kind).toBe("arquivo");
  });
  it("data de anexação vem da atividade financeira (última anexação/substituição)", () => {
    const at = (action: string, createdAt: string, area = "financeiro") => ({
      action,
      area,
      createdAt,
    });
    expect(notaFiscalAttachedAt(undefined)).toBeUndefined();
    expect(
      notaFiscalAttachedAt([
        at("anexou a nota fiscal", "2026-10-01T10:00:00Z"),
        at("substituiu a nota fiscal", "2026-10-05T10:00:00Z"),
        at("anexou o contrato", "2026-10-09T10:00:00Z"),
        at("anexou a nota fiscal", "2026-10-09T10:00:00Z", "geral"),
      ]),
    ).toBe("2026-10-05T10:00:00Z");
  });
  it("não se confunde com o contrato", () => {
    const act = [
      { action: "anexou o contrato", area: "financeiro", createdAt: "2026-10-01T10:00:00Z" },
    ];
    expect(contractAttachedAt(act)).toBe("2026-10-01T10:00:00Z");
    expect(notaFiscalAttachedAt(act)).toBeUndefined();
  });
});

describe("vencimento: o dia salvo não muda com o fuso", () => {
  it("formata a data ISO sem converter fuso", () => {
    expect(formatIsoDate("2026-10-06")).toBe("06/10/2026");
    expect(formatIsoDate("2026-01-01")).toBe("01/01/2026");
  });
  it("altera o vencimento sem mexer no resto do pagamento", () => {
    const p = pag({ aprovacao: "aceito", data: "2026-10-06" });
    const novo = { ...p, data: "2026-10-20" };
    expect(paymentState(novo, undefined, "2026-10-05").due).toBe("2026-10-20");
    expect(novo.config).toEqual(p.config);
    expect(paymentState(novo, undefined, "2026-10-21").key).toBe("vencido");
  });
});
