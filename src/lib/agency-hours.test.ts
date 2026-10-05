import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENCY_HOURS } from "./agency-hours";

/**
 * Testa as funções REAIS do banco (`business_seconds_between`/`is_agency_business_day`) rodando as
 * migrations num Postgres em memória (PGlite) — não uma cópia em TypeScript. Só o que é do
 * Supabase (papéis, `auth.uid()`, `is_admin`, `is_internal_team_member`) é stub. America/Sao_Paulo
 * é -03:00 o ano todo (sem horário de verão desde 2019), por isso os instantes usam `-03:00`.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const FIRST = "20261005100000_business_seconds_between.sql";
const SECOND = "20261005110000_business_hours_weekends_holidays.sql";
const sql = readFileSync(path.join(MIGRATIONS_DIR, FIRST), "utf8");
const sqlWeekends = readFileSync(path.join(MIGRATIONS_DIR, SECOND), "utf8");

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function public.is_admin(_user_id uuid) returns boolean language sql as $$ select false $$;
    create function public.is_internal_team_member(_user_id uuid) returns boolean language sql as $$ select false $$;
  `);
  await db.exec(sql);
  await db.exec(sqlWeekends);
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

  it("fim de semana não conta: sex 18:30 → seg 09:30 = 1h", async () => {
    expect(await secs("2026-10-02T18:30:00-03:00", "2026-10-05T09:30:00-03:00")).toBe(1 * H);
  });

  it("começar ou terminar num sábado/domingo", async () => {
    // sábado 10:00 → segunda 10:00: só 09:00–10:00 de segunda
    expect(await secs("2026-10-03T10:00:00-03:00", "2026-10-05T10:00:00-03:00")).toBe(1 * H);
    // sexta 18:00 → domingo 15:00: só 18:00–19:00 de sexta
    expect(await secs("2026-10-02T18:00:00-03:00", "2026-10-04T15:00:00-03:00")).toBe(1 * H);
    // sábado → domingo = 0
    expect(await secs("2026-10-03T10:00:00-03:00", "2026-10-04T18:00:00-03:00")).toBe(0);
  });

  it("feriado não conta (segunda 12/10/2026, Nossa Senhora Aparecida)", async () => {
    // sex 18:30 → terça 09:30 = 0,5h (sex) + 0,5h (ter); sáb, dom e feriado = 0
    expect(await secs("2026-10-09T18:30:00-03:00", "2026-10-13T09:30:00-03:00")).toBe(1 * H);
    // dentro do próprio feriado
    expect(await secs("2026-10-12T10:00:00-03:00", "2026-10-12T15:00:00-03:00")).toBe(0);
  });

  it("feriado móvel (Sexta-feira Santa 03/04/2026) e feriado numa sexta (20/11/2026)", async () => {
    expect(await secs("2026-04-02T18:30:00-03:00", "2026-04-06T09:30:00-03:00")).toBe(1 * H);
    expect(await secs("2026-11-19T18:30:00-03:00", "2026-11-23T09:30:00-03:00")).toBe(1 * H);
  });

  it("vários dias com fim de semana e feriado no meio", async () => {
    // qua 07/10 10:00 → seg 19/10 10:00: 9h (qua) + 10h (qui) + 10h (sex) + 0 (seg 12, feriado)
    // + 40h (ter–sex) + 1h (seg 19)
    expect(await secs("2026-10-07T10:00:00-03:00", "2026-10-19T10:00:00-03:00")).toBe(70 * H);
  });

  it("is_agency_business_day", async () => {
    const q = async (d: string) =>
      (await db.query<{ v: boolean }>("select public.is_agency_business_day($1::date) as v", [d]))
        .rows[0].v;
    expect(await q("2026-10-05")).toBe(true); // segunda
    expect(await q("2026-10-03")).toBe(false); // sábado
    expect(await q("2026-10-04")).toBe(false); // domingo
    expect(await q("2026-10-12")).toBe(false); // feriado
  });

  it("a conta por fórmula bate com a conta dia a dia (intervalos variados)", async () => {
    // Referência ingênua: soma, dia a dia, a sobreposição com 09–19 só nos dias úteis.
    const naive = async (a: string, b: string) =>
      (
        await db.query<{ v: number }>(
          `select coalesce(sum(
             case when public.is_agency_business_day(d::date) then
               greatest(0, extract(epoch from
                 least($2::timestamptz at time zone 'America/Sao_Paulo', d + time '19:00')
                 - greatest($1::timestamptz at time zone 'America/Sao_Paulo', d + time '09:00')))
             else 0 end), 0) as v
           from generate_series(
             ($1::timestamptz at time zone 'America/Sao_Paulo')::date,
             ($2::timestamptz at time zone 'America/Sao_Paulo')::date, interval '1 day') d`,
          [a, b],
        )
      ).rows[0].v;
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const base = Date.parse("2026-01-01T00:00:00-03:00");
    for (let i = 0; i < 60; i++) {
      const start = base + rnd(300 * 24 * 60) * 60_000;
      const end = start + rnd(40 * 24 * 60) * 60_000;
      const a = new Date(start).toISOString();
      const b = new Date(end).toISOString();
      expect(await secs(a, b), `${a} → ${b}`).toBe(Number(await naive(a, b)));
    }
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
