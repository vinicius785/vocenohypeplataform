import { describe, expect, it, vi } from "vitest";
import {
  connectionsToMarkSynced,
  outboundResultFor,
  processEachConnection,
  summarizeOutcomes,
  type ConnectionResult,
} from "@/lib/google-sync-runner";

const conns = [{ user_id: "a" }, { user_id: "b" }, { user_id: "c" }];

describe("processEachConnection — a falha de um usuário não interrompe os demais", () => {
  it("exceção na conexão B vira 'failed' só para B; A e C são processadas", async () => {
    const seen: string[] = [];
    const onError = vi.fn();
    const outcomes = await processEachConnection(
      conns,
      async (c) => {
        seen.push(c.user_id);
        if (c.user_id === "b") throw new Error("https://exemplo/segredo?token=abc");
        return "ok";
      },
      onError,
    );
    expect(seen).toEqual(["a", "b", "c"]);
    expect(Object.fromEntries(outcomes)).toEqual({ a: "ok", b: "failed", c: "ok" });
    // só o NOME do erro é reportado (a mensagem pode ter URL/dados)
    expect(onError).toHaveBeenCalledWith("Error");
    expect(JSON.stringify(onError.mock.calls)).not.toContain("segredo");
  });

  it("falha temporária e reautorização de uma conexão também não afetam as outras", async () => {
    const results: Record<string, ConnectionResult> = {
      a: "reauth_required",
      b: "transient",
      c: "ok",
    };
    const outcomes = await processEachConnection(conns, async (c) => results[c.user_id]);
    expect(Object.fromEntries(outcomes)).toEqual(results);
  });

  it("sem conexões, devolve resultado vazio", async () => {
    const outcomes = await processEachConnection([], async () => "ok");
    expect(summarizeOutcomes(outcomes)).toEqual({
      total: 0,
      ok: 0,
      skipped: 0,
      partial: 0,
      reauthRequired: 0,
      transient: 0,
      failed: 0,
    });
  });
});

describe("summarizeOutcomes — ciclo executado ≠ sincronização bem-sucedida", () => {
  it("distingue ok, ignorada, reautorização, falha temporária e falha interna (sem ids)", () => {
    const summary = summarizeOutcomes(
      new Map<string, ConnectionResult>([
        ["a", "ok"],
        ["b", "skipped"],
        ["c", "reauth_required"],
        ["d", "transient"],
        ["e", "failed"],
        ["f", "ok"],
        ["g", "partial"],
      ]),
    );
    expect(summary).toEqual({
      total: 7,
      ok: 2,
      skipped: 1,
      partial: 1,
      reauthRequired: 1,
      transient: 1,
      failed: 1,
    });
    expect(JSON.stringify(summary)).not.toMatch(/"[a-f]"/);
  });
});

describe("connectionsToMarkSynced — quando last_synced_at pode avançar", () => {
  const m = (entries: [string, ConnectionResult][]) => new Map(entries);

  it("envio ok + importação ok → avança", () => {
    expect(connectionsToMarkSynced(m([["a", "ok"]]), m([["a", "ok"]]))).toEqual(["a"]);
  });

  it("nada a enviar ('skipped') + importação ok → avança", () => {
    expect(connectionsToMarkSynced(m([["a", "skipped"]]), m([["a", "ok"]]))).toEqual(["a"]);
  });

  it.each(["transient", "reauth_required", "failed"] as const)(
    "importação '%s' → NÃO avança",
    (inbound) => {
      expect(connectionsToMarkSynced(m([["a", "ok"]]), m([["a", inbound]]))).toEqual([]);
    },
  );

  it.each(["transient", "reauth_required", "failed"] as const)(
    "envio '%s' (mesmo com importação ok) → NÃO avança",
    (outbound) => {
      expect(connectionsToMarkSynced(m([["a", outbound]]), m([["a", "ok"]]))).toEqual([]);
    },
  );

  it("conexão ausente do envio não avança", () => {
    expect(connectionsToMarkSynced(m([]), m([["a", "ok"]]))).toEqual([]);
  });

  it("só avança as conexões saudáveis; as quebradas mantêm o valor anterior", () => {
    const outbound = m([
      ["a", "ok"],
      ["b", "transient"],
      ["c", "skipped"],
      ["d", "ok"],
    ]);
    const inbound = m([
      ["a", "ok"],
      ["b", "transient"],
      ["c", "ok"],
      ["d", "reauth_required"],
    ]);
    expect(connectionsToMarkSynced(outbound, inbound).sort()).toEqual(["a", "c"]);
  });

  it("ciclo em que nenhuma conexão sincronizou não marca nenhuma (executado ≠ sincronizado)", () => {
    const failed = m([
      ["a", "transient"],
      ["b", "failed"],
    ]);
    expect(connectionsToMarkSynced(failed, failed)).toEqual([]);
  });
});

describe("outboundResultFor — sucesso total, parcial e falha total do envio", () => {
  it("nada tentado → skipped", () => {
    expect(outboundResultFor({ synced: 0, failed: 0 })).toBe("skipped");
  });
  it("todas ok → ok (sucesso total)", () => {
    expect(outboundResultFor({ synced: 4, failed: 0 })).toBe("ok");
  });
  it("algumas falharam → partial (sucesso parcial)", () => {
    expect(outboundResultFor({ synced: 3, failed: 1 })).toBe("partial");
  });
  it("TODAS falharam → transient (falha total, não é sincronização bem-sucedida)", () => {
    expect(outboundResultFor({ synced: 0, failed: 5 })).toBe("transient");
  });
});

describe("last_synced_at com envio parcial e total", () => {
  const m = (entries: [string, ConnectionResult][]) => new Map(entries);
  it("sucesso parcial do envio + importação ok → avança (a conexão funciona)", () => {
    expect(connectionsToMarkSynced(m([["a", "partial"]]), m([["a", "ok"]]))).toEqual(["a"]);
  });
  it("falha total do envio (todas as reuniões falharam) + importação ok → NÃO avança", () => {
    const out = outboundResultFor({ synced: 0, failed: 3 });
    expect(connectionsToMarkSynced(m([["a", out]]), m([["a", "ok"]]))).toEqual([]);
  });
});
