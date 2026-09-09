import { describe, expect, it } from "vitest";
import {
  fmtMonth,
  fromMonthKey,
  monthKey,
  parseMoney,
  type Entry,
  kpiTotals,
  resultadoRealizado,
  computeSaldoAtual,
  computeSaldoProjetado,
  dueBucket,
  agingBucket,
  diasDeAtraso,
  groupByDueBucket,
  groupByCampanha,
  remainingBalance,
  isPartiallyPaid,
  alertItems,
  dedupeImportEntries,
  prazoMedioLiquidacao,
} from "./financeiro-entries";

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    date: "2026-06-10",
    vencimento: "2026-06-10",
    competencia: "2026-06-10",
    description: "Lançamento de teste",
    category: "Outros",
    amount: 1000,
    kind: "receita",
    source: "manual",
    status: "a_receber",
    editable: true,
    ...overrides,
  };
}

describe("parseMoney", () => {
  it("parses plain integers and decimals", () => {
    expect(parseMoney("100")).toBe(100);
    expect(parseMoney("99.9")).toBe(99.9);
  });

  it("parses Brazilian-formatted currency strings", () => {
    expect(parseMoney("R$ 1.234,56")).toBeCloseTo(1234.56);
    expect(parseMoney("1.000")).toBe(1000);
  });

  it("returns 0 for empty, undefined, or non-numeric input", () => {
    expect(parseMoney(undefined)).toBe(0);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("abc")).toBe(0);
  });
});

describe("monthKey / fromMonthKey / fmtMonth", () => {
  it("formats a date as YYYY-MM", () => {
    expect(monthKey(new Date(2026, 6, 23))).toBe("2026-07");
    expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });

  it("round-trips monthKey -> fromMonthKey to the first day of that month", () => {
    const d = fromMonthKey("2026-07");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(1);
  });

  it("formats a month key as a localized month/year label", () => {
    const label = fmtMonth("2026-07");
    expect(label.toLowerCase()).toContain("2026");
  });
});

// Cenário 1/2/3: entradas/saídas/resultado realizado
describe("kpiTotals — entradas, saídas e resultado realizados", () => {
  it("só soma como realizado o que já foi recebido/pago", () => {
    const entries = [
      makeEntry({
        kind: "receita",
        status: "recebido",
        amount: 500,
        payment: { pagamento: "2026-06-05", paidAmount: 500, paymentMethod: "PIX" },
      }),
      makeEntry({ kind: "receita", status: "a_receber", amount: 300 }),
      makeEntry({
        kind: "despesa",
        status: "pago",
        amount: 200,
        payment: { pagamento: "2026-06-05", paidAmount: 200, paymentMethod: "PIX" },
      }),
      makeEntry({ kind: "despesa", status: "a_pagar", amount: 100 }),
    ];
    const totals = kpiTotals(entries);
    expect(totals.receitaRealizada).toBe(500);
    expect(totals.despesaRealizada).toBe(200);
    expect(totals.saldoRealizado).toBe(300);
    expect(totals.aReceber).toBe(300);
    expect(totals.aPagar).toBe(100);
  });

  it("nunca trata cancelado como realizado ou em aberto", () => {
    const entries = [makeEntry({ status: "cancelado", amount: 900 })];
    const totals = kpiTotals(entries);
    expect(totals.receitaRealizada).toBe(0);
    expect(totals.aReceber).toBe(0);
  });
});

// Cenário 3 (alternativo): resultado por data de liquidação, não vencimento
describe("resultadoRealizado", () => {
  it("usa a data de liquidação, não o vencimento", () => {
    const entries = [
      makeEntry({
        kind: "receita",
        status: "recebido",
        vencimento: "2026-05-20",
        amount: 1000,
        payment: { pagamento: "2026-06-02", paidAmount: 1000, paymentMethod: "PIX" },
      }),
    ];
    const junho = { from: "2026-06-01", to: "2026-06-30" };
    const maio = { from: "2026-05-01", to: "2026-05-31" };
    expect(resultadoRealizado(entries, junho).receita).toBe(1000);
    expect(resultadoRealizado(entries, maio).receita).toBe(0);
  });

  it("nunca conta um lançamento em aberto como realizado", () => {
    const entries = [makeEntry({ status: "a_receber", amount: 500 })];
    expect(resultadoRealizado(entries, { from: "2026-01-01", to: "2026-12-31" }).receita).toBe(0);
  });
});

// Cenário 29: saldo atual indisponível
describe("computeSaldoAtual", () => {
  it("retorna null quando não há saldo inicial configurado", () => {
    expect(computeSaldoAtual(null, [])).toBeNull();
  });

  it("soma liquidações posteriores à data-base do saldo inicial", () => {
    const entries = [
      makeEntry({
        status: "recebido",
        payment: { pagamento: "2026-06-05", paidAmount: 300, paymentMethod: "PIX" },
      }),
      makeEntry({
        kind: "despesa",
        status: "pago",
        payment: { pagamento: "2026-06-06", paidAmount: 100, paymentMethod: "PIX" },
      }),
      // liquidação ANTES da data-base não deve ser somada de novo
      makeEntry({
        status: "recebido",
        payment: { pagamento: "2026-05-01", paidAmount: 9999, paymentMethod: "PIX" },
      }),
    ];
    const saldo = computeSaldoAtual({ valor: 1000, data: "2026-06-01" }, entries);
    expect(saldo).toBe(1200);
  });
});

// Cenário 4/30: saldo projetado e horizonte
describe("computeSaldoProjetado", () => {
  it("retorna null sem saldo atual configurado", () => {
    expect(computeSaldoProjetado(null, [], "2026-06-30")).toBeNull();
  });

  it("só considera pendentes com vencimento dentro do horizonte", () => {
    const entries = [
      makeEntry({ status: "a_receber", vencimento: "2026-06-15", amount: 500 }),
      makeEntry({ status: "a_receber", vencimento: "2026-08-01", amount: 9999 }), // fora do horizonte
      makeEntry({ kind: "despesa", status: "a_pagar", vencimento: "2026-06-20", amount: 200 }),
    ];
    const projetado = computeSaldoProjetado(1000, entries, "2026-06-30");
    expect(projetado).toBe(1000 + 500 - 200);
  });

  it("não mistura a carteira completa com os lançamentos do horizonte", () => {
    const entries = [makeEntry({ status: "a_receber", vencimento: "2027-01-01", amount: 10_000 })];
    expect(computeSaldoProjetado(1000, entries, "2026-06-30")).toBe(1000);
  });
});

// Cenário 5/6/7/8: vencido, hoje, faixas mutuamente exclusivas
describe("dueBucket", () => {
  const hoje = "2026-06-15";
  it("classifica vencido, hoje e as faixas seguintes sem sobreposição", () => {
    expect(dueBucket("2026-06-14", hoje)).toBe("vencido");
    expect(dueBucket("2026-06-15", hoje)).toBe("vence_hoje");
    expect(dueBucket("2026-06-22", hoje)).toBe("proximos_7");
    expect(dueBucket("2026-06-23", hoje)).toBe("de_8_a_30");
    expect(dueBucket("2026-07-15", hoje)).toBe("de_8_a_30");
    expect(dueBucket("2026-07-16", hoje)).toBe("acima_30");
  });
});

describe("groupByDueBucket", () => {
  it("cada lançamento em aberto cai em exatamente uma faixa", () => {
    const hoje = "2026-06-15";
    const entries = [
      makeEntry({ status: "vencido", vencimento: "2026-06-01", amount: 100 }),
      makeEntry({ status: "a_receber", vencimento: hoje, amount: 200 }),
      makeEntry({ status: "a_receber", vencimento: "2026-06-20", amount: 300 }),
      makeEntry({ status: "a_receber", vencimento: "2026-06-30", amount: 400 }),
      makeEntry({ status: "a_receber", vencimento: "2026-08-01", amount: 500 }),
    ];
    const groups = groupByDueBucket(entries, hoje);
    const totalEmGrupos = Object.values(groups).reduce((s, g) => s + g.total, 0);
    const totalEntries = entries.reduce((s, e) => s + e.amount, 0);
    expect(totalEmGrupos).toBe(totalEntries);
    expect(groups.vencido.total).toBe(100);
    expect(groups.vence_hoje.total).toBe(200);
  });
});

// Cenário 9: aging de recebíveis
describe("agingBucket / diasDeAtraso", () => {
  it("classifica dias de atraso nas faixas esperadas", () => {
    expect(agingBucket(1)).toBe("1_a_7");
    expect(agingBucket(7)).toBe("1_a_7");
    expect(agingBucket(8)).toBe("8_a_15");
    expect(agingBucket(30)).toBe("16_a_30");
    expect(agingBucket(31)).toBe("31_a_60");
    expect(agingBucket(61)).toBe("mais_60");
  });

  it("calcula dias de atraso a partir do vencimento", () => {
    expect(diasDeAtraso("2026-06-01", "2026-06-10")).toBe(9);
    expect(diasDeAtraso("2026-06-15", "2026-06-10")).toBe(0);
  });
});

// Cenário 10/11/12: recebimento parcial, pagamento parcial, liquidação completa
describe("remainingBalance / isPartiallyPaid", () => {
  it("saldo restante é o valor cheio sem nenhuma confirmação", () => {
    const e = makeEntry({ amount: 1000 });
    expect(remainingBalance(e)).toBe(1000);
    expect(isPartiallyPaid(e)).toBe(false);
  });

  it("recebimento parcial deixa saldo restante correto e marca como parcial", () => {
    const e = makeEntry({
      amount: 1000,
      status: "a_receber",
      payment: { pagamento: "2026-06-05", paidAmount: 400, paymentMethod: "PIX" },
    });
    expect(remainingBalance(e)).toBe(600);
    expect(isPartiallyPaid(e)).toBe(true);
  });

  it("liquidação completa zera o saldo restante e não conta como parcial", () => {
    const e = makeEntry({
      amount: 1000,
      status: "recebido",
      payment: { pagamento: "2026-06-05", paidAmount: 1000, paymentMethod: "PIX" },
    });
    expect(remainingBalance(e)).toBe(0);
    expect(isPartiallyPaid(e)).toBe(false);
  });
});

// Cenário 13: lançamento cancelado nunca entra em totais
describe("groupByCampanha — exclui cancelados", () => {
  it("não soma lançamentos cancelados no resultado da campanha", () => {
    const entries = [
      makeEntry({ campanhaId: "c1", campanhaNome: "Campanha X", kind: "receita", amount: 1000 }),
      makeEntry({
        campanhaId: "c1",
        campanhaNome: "Campanha X",
        kind: "despesa",
        amount: 9999,
        status: "cancelado",
      }),
    ];
    const [row] = groupByCampanha(entries);
    expect(row.custos).toBe(0);
    expect(row.resultado).toBe(1000);
  });

  it("não calcula margem quando a receita é zero (cenário 20)", () => {
    const entries = [makeEntry({ campanhaId: "c2", kind: "despesa", amount: 500 })];
    const [row] = groupByCampanha(entries);
    expect(row.receita).toBe(0);
    expect(row.margem).toBe(0);
  });
});

// Cenário 25: importação sem duplicação
describe("dedupeImportEntries", () => {
  it("ignora linhas já existentes (mesma descrição, valor e data)", () => {
    const existing = [{ description: "Assinatura Meta Ads", amount: 199, date: "2026-06-01" }];
    const toImport = [
      { description: "Assinatura Meta Ads", amount: 199, date: "2026-06-01" },
      { description: "Nova despesa", amount: 50, date: "2026-06-02" },
    ];
    expect(dedupeImportEntries(toImport, existing)).toEqual([toImport[1]]);
  });

  it("ignora duplicatas dentro do próprio lote (reimportar o mesmo texto)", () => {
    const item = { description: "Item repetido", amount: 10, date: "2026-06-01" };
    expect(dedupeImportEntries([item, { ...item }], [])).toHaveLength(1);
  });
});

// Cenário 30: horizonte da projeção + alerta de risco de saldo negativo
describe("alertItems — risco de saldo negativo e qualidade de cadastro", () => {
  it("só emite o alerta de risco quando o saldo projetado é negativo", () => {
    expect(alertItems([], 7, 500)).toHaveLength(0);
    const alerts = alertItems([], 7, -200);
    expect(alerts.some((a) => a.kind === "risco_saldo_negativo")).toBe(true);
  });

  it("sinaliza lançamento manual em aberto sem cliente/categoria", () => {
    const entries = [
      makeEntry({ editable: true, clienteId: undefined, category: "", status: "a_receber" }),
    ];
    const alerts = alertItems(entries);
    expect(alerts.some((a) => a.kind === "sem_cliente")).toBe(true);
    expect(alerts.some((a) => a.kind === "sem_categoria")).toBe(true);
  });

  it("nunca aplica alerta de qualidade de cadastro a lançamentos auto-gerados", () => {
    const entries = [
      makeEntry({ editable: false, clienteId: undefined, category: "", status: "a_receber" }),
    ];
    const alerts = alertItems(entries);
    expect(alerts.some((a) => a.kind === "sem_cliente")).toBe(false);
  });
});

describe("prazoMedioLiquidacao", () => {
  it("retorna null quando não há nada liquidado", () => {
    expect(prazoMedioLiquidacao([makeEntry({ status: "a_receber" })], "receita")).toBeNull();
  });

  it("calcula a média de dias entre vencimento e liquidação", () => {
    const entries = [
      makeEntry({
        status: "recebido",
        vencimento: "2026-06-01",
        payment: { pagamento: "2026-06-06", paidAmount: 100, paymentMethod: "PIX" },
      }),
      makeEntry({
        status: "recebido",
        vencimento: "2026-06-01",
        payment: { pagamento: "2026-06-04", paidAmount: 100, paymentMethod: "PIX" },
      }),
    ];
    expect(prazoMedioLiquidacao(entries, "receita")).toBe(4);
  });
});
