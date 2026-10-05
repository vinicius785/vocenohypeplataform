import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENCY_HOURS } from "./agency-hours";

/**
 * Testa a função REAL do banco (`business_seconds_between`) rodando o SQL da migration num
 * Postgres em memória (PGlite) — não uma cópia em TypeScript. America/Sao_Paulo é -03:00 o ano
 * todo (sem horário de verão desde 2019), por isso os instantes abaixo usam `-03:00`.
 */
const MIGRATION = path.resolve(
  __dirname,
  "../../supabase/migrations/20261005100000_business_seconds_between.sql",
);
const sql = readFileSync(MIGRATION, "utf8");

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  // Só a definição da função (os GRANT/REVOKE dependem de papéis do Supabase).
  await db.exec(sql.slice(0, sql.indexOf("revoke all")));
});
afterAll(async () => {
  await db.close();
});

async function secs(start: string | null, end: string | null): Promise<number> {
  const r = await db.query<{ v: number }>(
    "select public.business_seconds_between($1::timestamptz, $2::timestamptz) as v",
    [start, end],
  );
  return r.rows[0].v;
}

const H = 3600;

describe("business_seconds_between — horário útil 09:00–19:00 (America/Sao_Paulo)", () => {
  it("resposta inteiramente dentro do horário = tempo corrido", async () => {
    expect(await secs("2026-10-05T10:00:00-03:00", "2026-10-05T11:30:00-03:00")).toBe(1.5 * H);
  });

  it("recebimento antes das 09:00: o relógio só começa às 09:00", async () => {
    expect(await secs("2026-10-05T07:00:00-03:00", "2026-10-05T10:00:00-03:00")).toBe(1 * H);
  });

  it("recebimento depois das 19:00: conta só a partir das 09:00 do dia seguinte", async () => {
    expect(await secs("2026-10-05T20:00:00-03:00", "2026-10-06T10:00:00-03:00")).toBe(1 * H);
  });

  it("atravessando a noite: 18:30 → 09:30 do dia seguinte = 1h (não 15h)", async () => {
    expect(await secs("2026-10-05T18:30:00-03:00", "2026-10-06T09:30:00-03:00")).toBe(1 * H);
  });

  it("atravessando vários dias: dias inteiros valem 10h", async () => {
    // seg 10:00 → qua 15:00 = 9h (seg) + 10h (ter) + 6h (qua)
    expect(await secs("2026-10-05T10:00:00-03:00", "2026-10-07T15:00:00-03:00")).toBe(25 * H);
  });

  it("exatamente 09:00", async () => {
    expect(await secs("2026-10-05T09:00:00-03:00", "2026-10-05T09:00:00-03:00")).toBe(0);
    expect(await secs("2026-10-05T09:00:00-03:00", "2026-10-05T09:01:00-03:00")).toBe(60);
    expect(await secs("2026-10-05T09:00:00-03:00", "2026-10-05T19:00:00-03:00")).toBe(10 * H);
  });

  it("exatamente 19:00", async () => {
    expect(await secs("2026-10-05T19:00:00-03:00", "2026-10-05T19:00:00-03:00")).toBe(0);
    expect(await secs("2026-10-05T18:00:00-03:00", "2026-10-05T19:00:00-03:00")).toBe(1 * H);
    expect(await secs("2026-10-05T19:00:00-03:00", "2026-10-06T09:00:00-03:00")).toBe(0);
  });

  it("fora do horário dos dois lados no mesmo período noturno = 0", async () => {
    expect(await secs("2026-10-05T20:00:00-03:00", "2026-10-05T23:00:00-03:00")).toBe(0);
    expect(await secs("2026-10-05T22:00:00-03:00", "2026-10-06T07:00:00-03:00")).toBe(0);
  });

  it("timezone: instantes em UTC são convertidos para Brasília antes de contar", async () => {
    // 21:30Z = 18:30 em Brasília; 12:30Z do dia seguinte = 09:30 em Brasília → 1h
    expect(await secs("2026-10-05T21:30:00Z", "2026-10-06T12:30:00Z")).toBe(1 * H);
    // 12:00Z = 09:00 em Brasília (se contasse em UTC, 12:00 já seria "meio do expediente")
    expect(await secs("2026-10-05T12:00:00Z", "2026-10-05T13:00:00Z")).toBe(1 * H);
    // 08:00Z–11:00Z = 05:00–08:00 em Brasília: ainda fechado
    expect(await secs("2026-10-05T08:00:00Z", "2026-10-05T11:00:00Z")).toBe(0);
  });

  it("intervalo vazio, invertido ou com ponta nula = 0", async () => {
    expect(await secs("2026-10-05T11:00:00-03:00", "2026-10-05T10:00:00-03:00")).toBe(0);
    expect(await secs(null, "2026-10-05T10:00:00-03:00")).toBe(0);
    expect(await secs("2026-10-05T10:00:00-03:00", null)).toBe(0);
  });

  it("fins de semana HOJE contam como dias úteis (a regra é só a janela diária)", async () => {
    // sex 18:30 → seg 09:30 = 0,5h + sáb 10h + dom 10h + 0,5h
    expect(await secs("2026-10-02T18:30:00-03:00", "2026-10-05T09:30:00-03:00")).toBe(21 * H);
  });
});

describe("métricas usam a função de horário útil", () => {
  it("get_member_response_time mede o tempo com business_seconds_between, nunca tempo corrido", () => {
    const m = readFileSync(
      path.resolve(
        __dirname,
        "../../supabase/migrations/20261005100100_response_time_business_hours.sql",
      ),
      "utf8",
    );
    expect(m).toContain("public.business_seconds_between(started_at, responded_at)");
    expect(m).not.toMatch(/extract\(epoch from \(responded_at - started_at\)\)/);
  });
});

describe("AGENCY_HOURS (espelho para a interface)", () => {
  it("bate com as constantes da função SQL", () => {
    expect(sql).toContain(`'${AGENCY_HOURS.timeZone}'`);
    expect(sql).toContain(`'${AGENCY_HOURS.open}'`);
    expect(sql).toContain(`'${AGENCY_HOURS.close}'`);
  });
});
