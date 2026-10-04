import { describe, expect, it, vi } from "vitest";
import type { DemoAssetSpec } from "./cenario-campanha-completa";
import { createSupabaseDemoPort, type DemoAdminClient } from "./demo-service.server";

type Chain = [method: string, args: unknown[]][];
type Result = { data?: unknown; error?: { code?: string; message: string } | null };

/** Cliente Supabase falso: registra cada consulta encadeada e responde via `handler`. */
function fakeAdmin(opts: {
  handler?: (table: string, chain: Chain) => Result | undefined;
  rpc?: (fn: string, args: unknown) => Result;
  storage?: Partial<{
    upload: (bucket: string, path: string, opts: unknown) => Result;
    sign: (bucket: string, path: string, seconds: number) => Result;
    list: (bucket: string, prefix: string) => Result;
    remove: (bucket: string, paths: string[]) => Result;
  }>;
}) {
  const queries: { table: string; chain: Chain }[] = [];
  const storageCalls: string[] = [];
  const admin = {
    from(table: string) {
      const chain: Chain = [];
      const builder: Record<string, unknown> = {};
      for (const m of [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "order",
        "limit",
        "single",
        "maybeSingle",
      ]) {
        builder[m] = (...args: unknown[]) => {
          chain.push([m, args]);
          return builder;
        };
      }
      builder.then = (resolve: (r: Result) => unknown) => {
        queries.push({ table, chain });
        const r = opts.handler?.(table, chain) ?? {};
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(resolve);
      };
      return builder;
    },
    rpc: (fn: string, args: unknown) => {
      const r = opts.rpc?.(fn, args) ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: unknown, o: unknown) => {
          storageCalls.push(`upload:${bucket}:${path}`);
          const r = opts.storage?.upload?.(bucket, path, o) ?? {};
          return { data: r.data ?? null, error: r.error ?? null };
        },
        createSignedUrl: async (path: string, seconds: number) => {
          storageCalls.push(`sign:${bucket}:${path}:${seconds}`);
          const r = opts.storage?.sign?.(bucket, path, seconds) ?? {
            data: { signedUrl: `https://signed.test/${bucket}/${path}` },
          };
          return { data: r.data ?? null, error: r.error ?? null };
        },
        list: async (prefix: string) => {
          storageCalls.push(`list:${bucket}:${prefix}`);
          const r = opts.storage?.list?.(bucket, prefix) ?? { data: [] };
          return { data: r.data ?? [], error: r.error ?? null };
        },
        remove: async (paths: string[]) => {
          storageCalls.push(`remove:${bucket}:${paths.join(",")}`);
          const r = opts.storage?.remove?.(bucket, paths) ?? {};
          return { data: r.data ?? null, error: r.error ?? null };
        },
      }),
    },
  };
  return { admin: admin as unknown as DemoAdminClient, queries, storageCalls };
}

const spec = (key: string, bucket: DemoAssetSpec["bucket"] = "entrega-anexos"): DemoAssetSpec => ({
  key,
  kind: "pdf",
  bucket,
  path: `demo/S/${key}.pdf`,
  fileName: `${key}.pdf`,
  title: key,
  lines: [],
});

const methods = (chain: Chain) => chain.map(([m]) => m);
const filters = (chain: Chain) => chain.filter(([m]) => m === "eq").map(([, a]) => a);

describe("getPrerequisites", () => {
  const OK = { schemaVersion: 1, rlsInternalOnly: true, npsGuard: true, markerGuard: true };

  it("função inexistente (migration pendente) ⇒ null, não erro", async () => {
    for (const error of [
      { code: "PGRST202", message: "x" },
      { code: "42883", message: "x" },
      { message: "Could not find the function public.demo_prerequisites" },
    ]) {
      const { admin } = fakeAdmin({ rpc: () => ({ error }) });
      expect(await createSupabaseDemoPort(admin).getPrerequisites()).toBeNull();
    }
  });

  it("devolve o objeto quando a forma é válida", async () => {
    const { admin } = fakeAdmin({ rpc: () => ({ data: OK }) });
    expect(await createSupabaseDemoPort(admin).getPrerequisites()).toEqual(OK);
  });

  it("forma inesperada ⇒ null (fail-closed: nunca presume que está tudo certo)", async () => {
    for (const data of [null, "ok", { schemaVersion: "1" }, { ...OK, markerGuard: "sim" }, {}]) {
      const { admin } = fakeAdmin({ rpc: () => ({ data }) });
      expect(
        await createSupabaseDemoPort(admin).getPrerequisites(),
        JSON.stringify(data),
      ).toBeNull();
    }
  });

  it("outro erro: falha com mensagem segura (sem detalhe de banco)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin } = fakeAdmin({
      rpc: () => ({ error: { code: "XX000", message: "senha do banco: hunter2" } }),
    });
    const err = await createSupabaseDemoPort(admin)
      .getPrerequisites()
      .catch((e: Error) => e);
    expect((err as Error).message).toBe(
      "Não foi possível completar esta operação. Tente novamente em instantes.",
    );
  });
});

describe("consultas de sessão", () => {
  it("por token: filtra exatamente pelo token", async () => {
    const { admin, queries } = fakeAdmin({ handler: () => ({ data: { id: "s1" } }) });
    const row = await createSupabaseDemoPort(admin).findSessionByToken("T".repeat(43));
    expect(row).toEqual({ id: "s1" });
    expect(queries[0].table).toBe("demo_sessions");
    expect(filters(queries[0].chain)).toEqual([["token", "T".repeat(43)]]);
    expect(methods(queries[0].chain)).toContain("maybeSingle");
  });

  it("demo ativa do lead: lead + status", async () => {
    const { admin, queries } = fakeAdmin({});
    await createSupabaseDemoPort(admin).findActiveSessionByLead("lead-1");
    expect(filters(queries[0].chain)).toEqual([
      ["lead_id", "lead-1"],
      ["status", "active"],
    ]);
  });

  it("mais recente do lead: ordenado por criação, decrescente, limite 1", async () => {
    const { admin, queries } = fakeAdmin({});
    await createSupabaseDemoPort(admin).findLatestSessionByLead("lead-1");
    const chain = queries[0].chain;
    expect(chain.find(([m]) => m === "order")![1]).toEqual(["created_at", { ascending: false }]);
    expect(chain.find(([m]) => m === "limit")![1]).toEqual([1]);
  });

  it("eventos: mais recentes primeiro", async () => {
    const { admin, queries } = fakeAdmin({ handler: () => ({ data: [{ id: "e1" }] }) });
    expect(await createSupabaseDemoPort(admin).listEvents("s1", 5)).toEqual([{ id: "e1" }]);
    expect(queries[0].chain.find(([m]) => m === "order")![1]).toEqual([
      "created_at",
      { ascending: false },
    ]);
    expect(queries[0].chain.find(([m]) => m === "limit")![1]).toEqual([5]);
  });

  it("atualizar sessão: update + id + devolve a linha", async () => {
    const { admin, queries } = fakeAdmin({
      handler: () => ({ data: { id: "s1", status: "closed" } }),
    });
    const row = await createSupabaseDemoPort(admin).updateSession("s1", { status: "closed" });
    expect(row.status).toBe("closed");
    expect(queries[0].chain[0]).toEqual(["update", [{ status: "closed" }]]);
    expect(filters(queries[0].chain)).toEqual([["id", "s1"]]);
  });
});

describe("organização da demo", () => {
  it("nasce `client` + `suspended` (nunca resolve como ambiente ativo de ninguém)", async () => {
    const { admin, queries } = fakeAdmin({ handler: () => ({ data: { id: "org-1" } }) });
    expect(await createSupabaseDemoPort(admin).createOrganization("Demonstração · X")).toBe(
      "org-1",
    );
    expect(queries[0].table).toBe("organizations");
    expect(queries[0].chain[0]).toEqual([
      "insert",
      [{ name: "Demonstração · X", type: "client", status: "suspended" }],
    ]);
  });
});

describe("applyScenario", () => {
  it("chama a RPC atômica com os nomes de parâmetro da migration", async () => {
    const rpc = vi.fn().mockReturnValue({});
    const { admin } = fakeAdmin({ rpc });
    const payload = { cliente: {} } as never;
    await createSupabaseDemoPort(admin).applyScenario("s1", payload);
    expect(rpc).toHaveBeenCalledWith("demo_apply_scenario", {
      p_session_id: "s1",
      p_payload: payload,
    });
  });

  it("falha da RPC: erro seguro", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin } = fakeAdmin({
      rpc: () => ({ error: { message: "violates foreign key constraint x" } }),
    });
    await expect(createSupabaseDemoPort(admin).applyScenario("s1", {} as never)).rejects.toThrow(
      /Não foi possível completar/,
    );
  });
});

describe("publishAssets", () => {
  it("envia cada arquivo (upsert, content-type) e assina por 1 ano", async () => {
    const uploads: unknown[] = [];
    const { admin, storageCalls } = fakeAdmin({
      storage: { upload: (_b, _p, o) => (uploads.push(o), {}) },
    });
    const urls = await createSupabaseDemoPort(admin).publishAssets("S", [
      spec("a"),
      { ...spec("b", "relatorios-mensais"), kind: "png" },
    ]);
    expect([...urls.keys()]).toEqual(["a", "b"]);
    expect(urls.get("b")).toBe("https://signed.test/relatorios-mensais/demo/S/b.pdf");
    expect(uploads).toEqual([
      { contentType: "application/pdf", upsert: true },
      { contentType: "image/png", upsert: true },
    ]);
    expect(storageCalls).toContain(`sign:entrega-anexos:demo/S/a.pdf:${365 * 24 * 3600}`);
    expect(storageCalls.filter((c) => c.startsWith("upload:"))).toHaveLength(2);
  });

  it("falha no upload: erro seguro, sem URL parcial", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin } = fakeAdmin({
      storage: { upload: () => ({ error: { message: "bucket not found: segredo" } }) },
    });
    const err = await createSupabaseDemoPort(admin)
      .publishAssets("S", [spec("a")])
      .catch((e: Error) => e);
    expect((err as Error).message).toMatch(/Não foi possível completar/);
    expect((err as Error).message).not.toMatch(/segredo/);
  });
});

describe("purgeAssets", () => {
  const listing = (names: string[]) => ({ data: names.map((name) => ({ name })) });

  it("lista o prefixo da demo nos dois buckets e remove tudo que não está em `keep`", async () => {
    const { admin, storageCalls } = fakeAdmin({
      storage: {
        list: (b) => listing(b === "entrega-anexos" ? ["a.pdf", "upload.png"] : ["rel.pdf"]),
      },
    });
    await createSupabaseDemoPort(admin).purgeAssets("S", ["demo/S/a.pdf", "demo/S/rel.pdf"]);
    expect(storageCalls).toEqual([
      "list:entrega-anexos:demo/S",
      "remove:entrega-anexos:demo/S/upload.png",
      "list:relatorios-mensais:demo/S",
    ]);
  });

  it("sem `keep` remove tudo; sem arquivos não chama `remove`", async () => {
    const { admin, storageCalls } = fakeAdmin({
      storage: { list: (b) => listing(b === "entrega-anexos" ? ["a.pdf"] : []) },
    });
    await createSupabaseDemoPort(admin).purgeAssets("S");
    expect(storageCalls).toEqual([
      "list:entrega-anexos:demo/S",
      "remove:entrega-anexos:demo/S/a.pdf",
      "list:relatorios-mensais:demo/S",
    ]);
  });

  it("só toca o prefixo da PRÓPRIA demo", async () => {
    const { admin, storageCalls } = fakeAdmin({});
    await createSupabaseDemoPort(admin).purgeAssets("outra-sessao");
    for (const c of storageCalls) expect(c).toContain("demo/outra-sessao");
  });
});

describe("removeSession (compensação)", () => {
  const session = { id: "S", cliente_id: "C", campanha_id: "K", organization_id: "O" };

  it("apaga os dados da campanha, depois o cliente (só se ainda for da demo), a sessão e a organização", async () => {
    const { admin, queries } = fakeAdmin({});
    await createSupabaseDemoPort(admin).removeSession(session);
    expect(queries.map((q) => q.table)).toEqual([
      "campanha_nps_influenciador",
      "campanha_influenciador_avaliacoes",
      "campanha_nps",
      "campaign_cycles",
      "campanha_influenciadores",
      "campanha_tarefas",
      "campanha_documentos",
      "campanha_cronograma",
      "clientes",
      "demo_sessions",
      "organizations",
    ]);
    for (const q of queries.slice(0, 8)) expect(filters(q.chain)).toEqual([["campanha_id", "K"]]);
    for (const q of queries) expect(methods(q.chain)[0]).toBe("delete");
    // o cliente só é apagado com id + organização + marcador batendo com a sessão
    expect(filters(queries[8].chain)).toEqual([
      ["id", "C"],
      ["organization_id", "O"],
      ["data->>demoSessionId", "S"],
    ]);
    expect(filters(queries[9].chain)).toEqual([["id", "S"]]);
    expect(filters(queries[10].chain)).toEqual([["id", "O"]]);
  });

  it("para no primeiro erro (não apaga a organização se o cliente ainda existe) e não vaza detalhe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin, queries } = fakeAdmin({
      handler: (table) =>
        table === "clientes" ? { error: { message: "FK organizations_fk detalhe" } } : undefined,
    });
    const err = await createSupabaseDemoPort(admin)
      .removeSession(session)
      .catch((e: Error) => e);
    expect((err as Error).message).toMatch(/Não foi possível completar/);
    expect((err as Error).message).not.toMatch(/FK|detalhe/);
    expect(queries.map((q) => q.table)).not.toContain("organizations");
    expect(queries.map((q) => q.table)).not.toContain("demo_sessions");
  });
});
