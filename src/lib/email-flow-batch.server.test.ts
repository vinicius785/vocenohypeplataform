import { describe, expect, it } from "vitest";
import { loadEmailRunContext, type DueRecipient } from "./email-flow-batch.server";

/**
 * Cobre a pré-carga em lote do cron de sequências de e-mail: mesmos dados que
 * as 4 consultas por destinatário traziam, mas em 4 consultas no total, lidas
 * por páginas (o PostgREST corta em 1000 linhas) e falhando alto se a leitura
 * falhar (o cron então responde 500 sem enviar nada).
 */

type Row = Record<string, unknown>;
type Call = { table: string; range?: [number, number] };

function fakeAdmin(tables: Record<string, Row[]>, failTable?: string) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table };
    calls.push(call);
    let inFilter: [string, unknown[]] | null = null;
    let notNullCol: string | null = null;
    const orderCols: string[] = [];
    const builder = {
      select: () => builder,
      in: (col: string, values: unknown[]) => {
        inFilter = [col, values];
        return builder;
      },
      not: (col: string) => {
        notNullCol = col;
        return builder;
      },
      order: (col: string) => {
        orderCols.push(col);
        return builder;
      },
      range: (a: number, b: number) => {
        call.range = [a, b];
        return builder;
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (table === failTable) {
          return Promise.resolve({ data: null, error: { message: `falha em ${table}` } }).then(
            resolve,
            reject,
          );
        }
        let rows = tables[table] ?? [];
        if (inFilter) {
          const [col, values] = inFilter;
          rows = rows.filter((r) => values.includes(r[col]));
        }
        if (notNullCol) rows = rows.filter((r) => r[notNullCol!] != null);
        rows = [...rows].sort((x, y) => {
          for (const c of orderCols) {
            if ((x[c] as number | string) < (y[c] as number | string)) return -1;
            if ((x[c] as number | string) > (y[c] as number | string)) return 1;
          }
          return 0;
        });
        if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  return { admin: { from } as never, calls };
}

const due = (id: string, campaign_id: string, email: string): DueRecipient => ({
  id,
  campaign_id,
  email,
});

describe("loadEmailRunContext", () => {
  const tables = {
    email_campaigns: [
      { id: "c1", status: "ativa" },
      { id: "c2", status: "pausada" },
      { id: "c9", status: "ativa" }, // fora do lote
    ],
    email_unsubscribes: [{ email: "fora@x.com" }, { email: "saiu@x.com" }],
    email_campaign_steps: [
      { id: "s2", campaign_id: "c1", position: 2 },
      { id: "s1", campaign_id: "c1", position: 1 },
      { id: "s3", campaign_id: "c2", position: 1 },
      { id: "s9", campaign_id: "c9", position: 1 }, // fora do lote
    ],
    email_sends: [
      { id: "e1", recipient_id: "r1", opened_at: "2026-10-01T10:00:00Z" },
      { id: "e2", recipient_id: "r2", opened_at: null }, // enviado, não aberto
      { id: "e3", recipient_id: "r9", opened_at: "2026-10-01T10:00:00Z" }, // fora do lote
    ],
  };
  const batch = [
    due("r1", "c1", "a@x.com"),
    due("r2", "c1", "saiu@x.com"),
    due("r3", "c2", "c@x.com"),
  ];

  it("monta o mesmo contexto que as consultas por destinatário traziam", async () => {
    const { admin } = fakeAdmin(tables);
    const ctx = await loadEmailRunContext(admin, batch);

    expect(Object.fromEntries(ctx.campaignStatus)).toEqual({ c1: "ativa", c2: "pausada" });
    expect([...ctx.unsubscribedEmails]).toEqual(["saiu@x.com"]);
    expect(ctx.stepsByCampaign.get("c1")?.map((s) => s.id)).toEqual(["s1", "s2"]); // por position
    expect(ctx.stepsByCampaign.get("c2")?.map((s) => s.id)).toEqual(["s3"]);
    expect(ctx.stepsByCampaign.has("c9")).toBe(false);
    // só r1 abriu algum envio; r2 recebeu e não abriu; r9 nem está no lote
    expect([...ctx.openedRecipientIds]).toEqual(["r1"]);
  });

  it("faz 4 consultas para o lote inteiro, não 4 por destinatário", async () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      due(`r${i}`, i % 2 ? "c1" : "c2", `p${i}@x.com`),
    );
    const { admin, calls } = fakeAdmin(tables);
    await loadEmailRunContext(admin, many);
    expect(calls.map((c) => c.table).sort()).toEqual([
      "email_campaign_steps",
      "email_campaigns",
      "email_sends",
      "email_unsubscribes",
    ]);
  });

  it("lê todas as páginas (o PostgREST corta em 1000 linhas)", async () => {
    const steps = Array.from({ length: 2350 }, (_, i) => ({
      id: `s${String(i).padStart(5, "0")}`,
      campaign_id: "c1",
      position: i + 1,
    }));
    const { admin, calls } = fakeAdmin({ ...tables, email_campaign_steps: steps });
    const ctx = await loadEmailRunContext(admin, [due("r1", "c1", "a@x.com")]);

    expect(ctx.stepsByCampaign.get("c1")).toHaveLength(2350);
    expect(ctx.stepsByCampaign.get("c1")?.[0].position).toBe(1);
    expect(ctx.stepsByCampaign.get("c1")?.[2349].position).toBe(2350);
    const stepCalls = calls.filter((c) => c.table === "email_campaign_steps");
    expect(stepCalls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("sem destinatários vencidos não consulta o banco", async () => {
    const { admin, calls } = fakeAdmin(tables);
    const ctx = await loadEmailRunContext(admin, []);
    expect(calls).toHaveLength(0);
    expect(ctx.campaignStatus.size + ctx.unsubscribedEmails.size).toBe(0);
  });

  it.each(["email_campaigns", "email_unsubscribes", "email_campaign_steps", "email_sends"])(
    "falha alto se a leitura de %s falhar (nada de decidir com dado faltando)",
    async (failing) => {
      const { admin } = fakeAdmin(tables, failing);
      await expect(loadEmailRunContext(admin, batch)).rejects.toThrow(`falha em ${failing}`);
    },
  );
});
