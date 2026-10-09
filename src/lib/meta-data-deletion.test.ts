import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPublicDeletionStatus,
  handleMetaDeletionCallback,
  isConfirmationCode,
  metaUserHash,
  parseMetaSignedRequest,
  type DeletionRepo,
  type DeletionRow,
  type DeletionStatus,
  type MetaDataStore,
} from "./meta-data-deletion";

const SECRET = "app-secret-de-teste-1234567890";
const APP_URL = "https://plataforma.vocenohype.com.br";
const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");
const signed = (payload: object, secret = SECRET) => {
  const p = b64(JSON.stringify(payload));
  return `${b64(createHmac("sha256", secret).update(p).digest())}.${p}`;
};
const req = (userId: string, issuedAt = 1_700_000_000, extra: object = {}) =>
  signed({ algorithm: "HMAC-SHA256", user_id: userId, issued_at: issuedAt, ...extra });

function memRepo() {
  const rows: (DeletionRow & { hash: string; issuedAt: number })[] = [];
  const history: { id: string; status: DeletionStatus }[] = [];
  let n = 0;
  const repo: DeletionRepo = {
    async findByUserAndIssued(hash, issuedAt) {
      return rows.find((r) => r.hash === hash && r.issuedAt === issuedAt) ?? null;
    },
    async insert({ code, hash, issuedAt }) {
      const r = {
        id: `r${++n}`,
        confirmationCode: code,
        status: "received" as DeletionStatus,
        summary: {},
        createdAt: "2026-10-09T12:00:00Z",
        completedAt: null,
        hash,
        issuedAt,
      };
      rows.push(r);
      return r;
    },
    async update(id, patch) {
      const r = rows.find((x) => x.id === id)!;
      r.status = patch.status;
      if (patch.summary) r.summary = patch.summary;
      r.completedAt = patch.status === "completed" ? "2026-10-09T12:01:00Z" : null;
      history.push({ id, status: patch.status });
    },
    async findByCode(code) {
      return rows.find((r) => r.confirmationCode === code) ?? null;
    },
  };
  return { repo, rows, history };
}
const call = (
  m: ReturnType<typeof memRepo>,
  signedRequest: string | null,
  stores: MetaDataStore[] = [],
) =>
  handleMetaDeletionCallback({
    signedRequest,
    appSecret: SECRET,
    appUrl: () => APP_URL,
    repo: m.repo,
    stores,
  });

afterEach(() => vi.restoreAllMocks());

describe("signed_request", () => {
  it("assinatura válida devolve o usuário só depois de validar", () => {
    expect(parseMetaSignedRequest(req("1234567890"), SECRET)).toEqual({
      ok: true,
      userId: "1234567890",
      issuedAt: 1_700_000_000,
    });
  });
  it("assinatura inválida, segredo errado ou payload adulterado são recusados", () => {
    expect(parseMetaSignedRequest(req("1", 1, {}), "outro-segredo")).toMatchObject({
      ok: false,
      reason: "bad_signature",
    });
    const [sig, payload] = req("1").split(".");
    const forged = b64(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999", issued_at: 1 }));
    expect(parseMetaSignedRequest(`${sig}.${forged}`, SECRET)).toMatchObject({
      reason: "bad_signature",
    });
    expect(payload).toBeTruthy();
  });
  it("ausente ou malformado", () => {
    expect(parseMetaSignedRequest(null, SECRET)).toMatchObject({ reason: "missing" });
    expect(parseMetaSignedRequest("", SECRET)).toMatchObject({ reason: "missing" });
    for (const bad of ["semponto", "a.b.c", ".x", "x.", "ab$.cd", "a b.c"])
      expect(parseMetaSignedRequest(bad, SECRET)).toMatchObject({ ok: false, reason: "malformed" });
  });
  it("algoritmo diferente e user_id inválido (mesmo com assinatura correta) são recusados", () => {
    expect(
      parseMetaSignedRequest(signed({ algorithm: "HS1", user_id: "1" }), SECRET),
    ).toMatchObject({
      reason: "bad_algorithm",
    });
    expect(
      parseMetaSignedRequest(signed({ algorithm: "HMAC-SHA256", user_id: "../x;drop" }), SECRET),
    ).toMatchObject({ reason: "bad_payload" });
    expect(parseMetaSignedRequest(signed({ algorithm: "HMAC-SHA256" }), SECRET)).toMatchObject({
      reason: "bad_payload",
    });
  });
});

describe("callback", () => {
  it("responde o JSON exigido com url pública e código imprevisível", async () => {
    const m = memRepo();
    const out = await call(m, req("42"));
    expect(out.status).toBe(200);
    const code = out.body.confirmation_code as string;
    expect(isConfirmationCode(code)).toBe(true);
    expect(out.body).toEqual({
      url: `${APP_URL}/exclusao-de-dados/${code}`,
      confirmation_code: code,
    });
    expect(Object.keys(out.body).sort()).toEqual(["confirmation_code", "url"]);
  });

  it("assinatura inválida: 400, nada gravado; segredo ausente: 500", async () => {
    const m = memRepo();
    expect((await call(m, signed({ algorithm: "HMAC-SHA256", user_id: "1" }, "x"))).status).toBe(
      400,
    );
    expect((await call(m, null)).status).toBe(400);
    expect((await call(m, "lixo")).status).toBe(400);
    expect(m.rows).toHaveLength(0);
    const out = await handleMetaDeletionCallback({
      signedRequest: req("1"),
      appSecret: undefined,
      appUrl: () => APP_URL,
      repo: m.repo,
    });
    expect(out.status).toBe(500);
    expect(m.rows).toHaveLength(0);
  });

  it("pedido duplicado (mesmo signed_request) é idempotente: mesmo código, um só registro", async () => {
    const m = memRepo();
    const a = await call(m, req("42", 100));
    const b = await call(m, req("42", 100));
    expect(b.body.confirmation_code).toBe(a.body.confirmation_code);
    expect(m.rows).toHaveLength(1);
    // novo pedido do mesmo usuário (outro issued_at) é processado de novo
    const c = await call(m, req("42", 200));
    expect(c.body.confirmation_code).not.toBe(a.body.confirmation_code);
    expect(m.rows).toHaveLength(2);
  });

  it("não guarda o ID da Meta em claro", async () => {
    const m = memRepo();
    await call(m, req("1234567890123"));
    expect(JSON.stringify(m.rows)).not.toContain("1234567890123");
    expect(m.rows[0].hash).toBe(metaUserHash("1234567890123", SECRET));
    expect(metaUserHash("1", SECRET)).not.toBe(metaUserHash("1", "outro"));
  });
});

describe("configuração", () => {
  it("APP_URL ausente não mascara pedido inválido (400) e só falha ao montar a resposta válida", async () => {
    const m = memRepo();
    const noUrl = () => {
      throw new Error("APP_URL ausente");
    };
    const bad = await handleMetaDeletionCallback({
      signedRequest: "lixo",
      appSecret: SECRET,
      appUrl: noUrl,
      repo: m.repo,
    });
    expect(bad.status).toBe(400);
  });
});

describe("processamento real", () => {
  it("recebido → em processamento → concluído, e só conclui depois dos armazenamentos", async () => {
    const m = memRepo();
    let statusDuringStore: DeletionStatus | null = null;
    const store: MetaDataStore = {
      name: "tokens",
      async deleteForMetaUser() {
        statusDuringStore = m.rows[0].status;
        return 3;
      },
    };
    await call(m, req("7"), [store]);
    expect(statusDuringStore).toBe("processing");
    expect(m.history.map((h) => h.status)).toEqual(["processing", "completed"]);
    expect(m.rows[0].summary).toMatchObject({ stores: 1, deleted: 3 });
  });

  it("usuário sem vínculo: conclui informando que nada foi excluído", async () => {
    const m = memRepo();
    const out = await call(m, req("sem-vinculo"));
    const st = await getPublicDeletionStatus(m.repo, out.body.confirmation_code as string);
    expect(st).toMatchObject({ state: "concluido", deletedCount: 0 });
  });

  it("falha num armazenamento nunca vira 'concluído' e é reprocessada na reentrega", async () => {
    const m = memRepo();
    let fail = true;
    const store: MetaDataStore = {
      name: "dados",
      async deleteForMetaUser() {
        if (fail) throw new Error("boom com dado sensível 1234");
        return 1;
      },
    };
    const first = await call(m, req("9", 5), [store]);
    expect(m.rows[0].status).toBe("failed");
    expect(
      (await getPublicDeletionStatus(m.repo, first.body.confirmation_code as string)).state,
    ).toBe("em_processamento");
    fail = false;
    await call(m, req("9", 5), [store]);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].status).toBe("completed");
  });

  it("isola usuários e organizações: apaga só as linhas do hash do pedido", async () => {
    const m = memRepo();
    const hashA = metaUserHash("A", SECRET);
    const hashB = metaUserHash("B", SECRET);
    // dados de duas organizações; cada linha pertence a uma identidade Meta
    const data = [
      { org: "org1", hash: hashA },
      { org: "org1", hash: hashB },
      { org: "org2", hash: hashA },
      { org: "org2", hash: hashB },
    ];
    const store: MetaDataStore = {
      name: "vinculos",
      async deleteForMetaUser(h) {
        const before = data.length;
        for (let i = data.length - 1; i >= 0; i--) if (data[i].hash === h) data.splice(i, 1);
        return before - data.length;
      },
    };
    await call(m, req("A"), [store]);
    expect(data.every((d) => d.hash === hashB)).toBe(true);
    expect(data.map((d) => d.org).sort()).toEqual(["org1", "org2"]); // nenhuma organização apagada
    expect(m.rows[0].summary).toMatchObject({ deleted: 2 });
  });
});

describe("consulta pública", () => {
  it("estados do pedido e 'não encontrado'", async () => {
    const m = memRepo();
    const out = await call(m, req("1"));
    const code = out.body.confirmation_code as string;
    expect((await getPublicDeletionStatus(m.repo, code)).state).toBe("concluido");
    m.rows[0].status = "received";
    expect((await getPublicDeletionStatus(m.repo, code)).state).toBe("recebido");
    m.rows[0].status = "processing";
    expect((await getPublicDeletionStatus(m.repo, code)).state).toBe("em_processamento");
    expect((await getPublicDeletionStatus(m.repo, "a".repeat(32))).state).toBe("nao_encontrado");
    for (const bad of ["", "abc", "x".repeat(32), "../etc/passwd", "A".repeat(32)])
      expect((await getPublicDeletionStatus(m.repo, bad)).state).toBe("nao_encontrado");
  });

  it("só devolve estado, datas e contagem: sem ID, hash, e-mail ou dados da conta", async () => {
    const m = memRepo();
    const out = await call(m, req("555666777"));
    const st = await getPublicDeletionStatus(m.repo, out.body.confirmation_code as string);
    expect(Object.keys(st).sort()).toEqual(["completedAt", "createdAt", "deletedCount", "state"]);
    const text = JSON.stringify(st);
    expect(text).not.toContain("555666777");
    expect(text).not.toContain(m.rows[0].hash);
  });
});

describe("sem vazamento em logs, respostas e erros", () => {
  it("nenhum console recebe segredo, signed_request ou ID da Meta (nem nas falhas)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    );
    const m = memRepo();
    const sr = req("98765432100");
    const bad: MetaDataStore = {
      name: "x",
      async deleteForMetaUser() {
        throw new Error("falha com 98765432100");
      },
    };
    const outs = [
      await call(m, sr, [bad]),
      await call(m, "lixo"),
      await call(m, signed({ algorithm: "HMAC-SHA256", user_id: "1" }, "outro")),
    ];
    const everything = JSON.stringify([outs, spies.flatMap((s) => s.mock.calls)]);
    for (const secret of [SECRET, sr, "98765432100"]) expect(everything).not.toContain(secret);
    expect(spies.every((s) => s.mock.calls.length === 0)).toBe(true);
  });
});
