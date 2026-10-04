import { describe, expect, it, vi } from "vitest";
import { DEMO_READ_LIMIT, DEMO_WRITE_LIMIT } from "./demo-public";
import {
  createSupabaseDemoPublicPort,
  rateLimitBucket,
  type DemoPublicDeps,
} from "./demo-public.server";
import type { DemoAdminClient } from "./demo-service.server";
import type { DemoSessionRow } from "./demo-types";

const session = {
  id: "S",
  cliente_id: "C",
  campanha_id: "K",
  organization_id: "O",
} as DemoSessionRow;

function fakeAdmin(
  clienteRow: unknown,
  opts: { signError?: boolean; clienteError?: boolean } = {},
) {
  const filters: unknown[][] = [];
  const signed: { path: string; seconds: number }[] = [];
  const admin = {
    from: (table: string) => {
      expect(table).toBe("clientes");
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = (...a: unknown[]) => (filters.push(a), c);
      c.maybeSingle = () =>
        Promise.resolve(
          opts.clienteError
            ? { data: null, error: { message: "segredo do banco" } }
            : { data: clienteRow === undefined ? null : { data: clienteRow }, error: null },
        );
      return c;
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe("relatorios-mensais");
        return {
          createSignedUrl: async (path: string, seconds: number) => {
            signed.push({ path, seconds });
            return opts.signError
              ? { data: null, error: { message: "x" } }
              : { data: { signedUrl: `https://signed.test/${path}` }, error: null };
          },
        };
      },
    },
  };
  return { admin: admin as unknown as DemoAdminClient, filters, signed };
}

function deps(over: Partial<DemoPublicDeps> = {}): DemoPublicDeps {
  return {
    resolve: vi.fn(),
    checkRateLimit: vi.fn().mockResolvedValue(true),
    buildClienteLinkData: vi
      .fn()
      .mockResolvedValue({ clienteNome: "X", campanhas: [], artigos: [] }),
    loadInfluRow: vi.fn(),
    saveInfluRow: vi.fn(),
    ...over,
  };
}

const goodCliente = {
  demoSessionId: "S",
  empresa: "X",
  campanhas: [
    { id: "K", relatoriosMensais: [{ id: "r1", storagePath: "demo/S/relatorio.pdf" }] },
    { id: "OUTRA", relatoriosMensais: [{ id: "r2", storagePath: "real/segredo.pdf" }] },
  ],
};

describe("rateLimitBucket", () => {
  it("o token NUNCA aparece no bucket (só um resumo), e é estável por tipo", () => {
    const token = "T".repeat(43);
    const b = rateLimitBucket("read", token);
    expect(b).not.toContain(token);
    expect(b).toMatch(/^demo-read:[0-9a-f]{24}$/);
    expect(rateLimitBucket("read", token)).toBe(b);
    expect(rateLimitBucket("write", token)).not.toBe(b);
    expect(rateLimitBucket("read", "U".repeat(43))).not.toBe(b);
  });
});

describe("limite de uso", () => {
  it("leitura e escrita usam limites distintos e o bucket com resumo do token", async () => {
    const d = deps();
    const port = createSupabaseDemoPublicPort(fakeAdmin(goodCliente).admin, d);
    await port.rateLimit("read", "T".repeat(43));
    await port.rateLimit("write", "T".repeat(43));
    expect(d.checkRateLimit).toHaveBeenNthCalledWith(
      1,
      rateLimitBucket("read", "T".repeat(43)),
      DEMO_READ_LIMIT.max,
      DEMO_READ_LIMIT.windowSeconds,
    );
    expect(d.checkRateLimit).toHaveBeenNthCalledWith(
      2,
      rateLimitBucket("write", "T".repeat(43)),
      DEMO_WRITE_LIMIT.max,
      DEMO_WRITE_LIMIT.windowSeconds,
    );
    expect(DEMO_WRITE_LIMIT.max).toBeLessThan(DEMO_READ_LIMIT.max);
  });
});

describe("loadPortalData", () => {
  it("busca o cliente por id + organização da SESSÃO e monta os dados", async () => {
    const d = deps();
    const { admin, filters } = fakeAdmin(goodCliente);
    const data = await createSupabaseDemoPublicPort(admin, d).loadPortalData(session);
    expect(filters).toEqual([
      ["id", "C"],
      ["organization_id", "O"],
    ]);
    expect(d.buildClienteLinkData).toHaveBeenCalledWith("C", goodCliente);
    expect(data.clienteNome).toBe("X");
  });

  it("recusa se o marcador não bate com a sessão (cliente trocado/real) — nada é montado", async () => {
    const d = deps();
    for (const row of [
      { ...goodCliente, demoSessionId: "OUTRA-SESSAO" },
      { empresa: "Real" },
      undefined,
    ]) {
      const port = createSupabaseDemoPublicPort(fakeAdmin(row).admin, d);
      await expect(port.loadPortalData(session)).rejects.toThrow("Demonstração indisponível.");
    }
    expect(d.buildClienteLinkData).not.toHaveBeenCalled();
  });

  it("erro de banco: mensagem segura, sem detalhe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const port = createSupabaseDemoPublicPort(
      fakeAdmin(null, { clienteError: true }).admin,
      deps(),
    );
    const err = await port.loadPortalData(session).catch((e: Error) => e);
    expect((err as Error).message).not.toContain("segredo");
  });
});

describe("signReportUrl", () => {
  it("assina por 1 hora só relatório da campanha da SESSÃO", async () => {
    const { admin, signed } = fakeAdmin(goodCliente);
    const port = createSupabaseDemoPublicPort(admin, deps());
    expect(await port.signReportUrl(session, "r1")).toBe(
      "https://signed.test/demo/S/relatorio.pdf",
    );
    expect(signed).toEqual([{ path: "demo/S/relatorio.pdf", seconds: 3600 }]);
  });

  it("relatório de outra campanha ou inexistente: null, e nada é assinado", async () => {
    const { admin, signed } = fakeAdmin(goodCliente);
    const port = createSupabaseDemoPublicPort(admin, deps());
    expect(await port.signReportUrl(session, "r2")).toBeNull();
    expect(await port.signReportUrl(session, "nao-existe")).toBeNull();
    expect(signed).toHaveLength(0);
  });
});

describe("encaminhamento", () => {
  it("resolve, load/save de influenciador e o sinal usam as dependências injetadas", () => {
    const d = deps({ afterWrite: vi.fn() });
    const port = createSupabaseDemoPublicPort(fakeAdmin(goodCliente).admin, d);
    expect(port.resolve).toBe(d.resolve);
    expect(port.loadInflu).toBe(d.loadInfluRow);
    expect(port.saveInflu).toBe(d.saveInfluRow);
    expect(port.afterWrite).toBe(d.afterWrite);
  });
});
