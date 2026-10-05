import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(
    __dirname,
    "../../supabase/migrations/20261006050000_chat_sem_mencao_em_conversa_direta.sql",
  ),
  "utf8",
);

let db: PGlite;
const U = (id: string) => ({ kind: "user", id, label: id });
const T = { kind: "task", id: "t1", label: "Briefing" };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create table public.chat_messages (id serial primary key, convo_id text, mentions jsonb default '[]');`,
  );
  // Histórico anterior à regra: DM com menção de pessoa + referência, e um canal com menção.
  await db.query(
    `insert into public.chat_messages (convo_id, mentions) values ($1, $2), ($3, $4)`,
    ["dm:a|b", JSON.stringify([U("lucas"), T]), "c:geral", JSON.stringify([U("lucas")])],
  );
  await db.exec(sql);
});
afterAll(async () => {
  await db.close();
});

const mentionsOf = async (convo: string) =>
  (
    await db.query<{ mentions: unknown[] }>(
      "select mentions from public.chat_messages where convo_id = $1 order by id desc limit 1",
      [convo],
    )
  ).rows[0].mentions;

describe("migration: conversa direta não tem menção de pessoa", () => {
  it("limpa o histórico de DMs e preserva referências e canais", async () => {
    expect(await mentionsOf("dm:a|b")).toEqual([T]);
    expect(await mentionsOf("c:geral")).toEqual([U("lucas")]);
  });
  it("trigger: INSERT em DM descarta menções de pessoa e mantém as demais", async () => {
    await db.query("insert into public.chat_messages (convo_id, mentions) values ($1, $2)", [
      "dm:x|y",
      JSON.stringify([U("lucas"), U("__everyone__"), T]),
    ]);
    expect(await mentionsOf("dm:x|y")).toEqual([T]);
  });
  it("trigger: UPDATE de mentions em DM também é saneado; em canal não muda", async () => {
    await db.query("update public.chat_messages set mentions = $1 where convo_id = $2", [
      JSON.stringify([U("rodrigo")]),
      "dm:x|y",
    ]);
    expect(await mentionsOf("dm:x|y")).toEqual([]);
    await db.query("insert into public.chat_messages (convo_id, mentions) values ($1, $2)", [
      "camp:9",
      JSON.stringify([U("rodrigo")]),
    ]);
    expect(await mentionsOf("camp:9")).toEqual([U("rodrigo")]);
  });
});
