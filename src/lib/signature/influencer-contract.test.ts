import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { snapshotFromDocument } from "./autentique-status";
import { handleAutentiqueWebhook } from "./autentique-webhook-handler";
import {
  autentiqueWebhookSecretsFromEnv,
  parseAutentiqueEvent,
  verifyAutentiqueSignature,
  verifyAutentiqueSignatureAny,
} from "./autentique-webhook";
import {
  ActiveContractExistsError,
  ContractPersistError,
  createInfluencerContract,
  processAutentiqueEvent,
  type ContractRepo,
  type ContractRow,
  type SignerRow,
} from "./influencer-contract-service";
import { SignatureProviderError, type SignatureProvider } from "./signature-provider";

type Sig = {
  public_id: string;
  email: string;
  signed?: { created_at: string } | null;
  rejected?: { created_at: string } | null;
  viewed?: { created_at: string } | null;
};

function memRepo() {
  const contracts: ContractRow[] = [];
  const signers: SignerRow[] = [];
  const events = new Map<string, { processed: boolean; erro: string | null }>();
  let n = 0;
  const repo: ContractRepo = {
    async insertContract(participacaoId, provider) {
      const live = ["aguardando", "parcial", "assinado"];
      if (contracts.some((c) => c.participacaoId === participacaoId && live.includes(c.status)))
        throw new ActiveContractExistsError();
      const c: ContractRow = {
        id: `c${++n}`,
        participacaoId,
        provider,
        externalId: null,
        status: "aguardando",
        sentAt: null,
        completedAt: null,
        rejectedAt: null,
        cancelledAt: null,
      };
      contracts.push(c);
      return c;
    },
    async insertSigners(contratoId, list) {
      const rows = list.map((s, i) => ({ ...s, id: `s${contratoId}${i}`, contratoId }));
      signers.push(...rows);
      return rows;
    },
    async patchContract(id, patch) {
      Object.assign(contracts.find((c) => c.id === id)!, patch);
    },
    async patchSigner(id, patch) {
      Object.assign(signers.find((s) => s.id === id)!, patch);
    },
    async findByExternalId(provider, ext) {
      return contracts.find((c) => c.provider === provider && c.externalId === ext) ?? null;
    },
    async listSigners(id) {
      return signers.filter((s) => s.contratoId === id);
    },
    async insertEvent(e) {
      const k = `${e.provider}:${e.eventId}`;
      const ex = events.get(k);
      if (ex) return { duplicate: true, processed: ex.processed };
      events.set(k, { processed: false, erro: null });
      return { duplicate: false, processed: false };
    },
    async finishEvent(p, id, r) {
      events.set(`${p}:${id}`, {
        processed: !r.erro || r.erro === "contrato_nao_encontrado",
        erro: r.erro,
      });
    },
  };
  return { repo, contracts, signers, events };
}

/** Provedor falso: o "documento remoto" é mutável e o estado sai de snapshotFromDocument. */
function fakeProvider(opts: { createError?: SignatureProviderError } = {}) {
  const remote: { signatures: Sig[]; calls: number } = { signatures: [], calls: 0 };
  const provider: SignatureProvider = {
    name: "autentique",
    async createAndSend(input) {
      if (opts.createError) throw opts.createError;
      remote.signatures = [
        ...input.signers.map((s, i) => ({ public_id: `sig${i}`, email: s.email })),
        { public_id: "sigX", email: "extra@outro.com" },
      ];
      return {
        externalId: "doc1",
        signers: input.signers.map((s, i) => ({
          externalId: `sig${i}`,
          role: s.role,
          name: s.name,
          email: s.email,
          action: "SIGN",
          hasAccount: false,
          link: null,
        })),
      };
    },
    async getDocument(id, expected) {
      remote.calls++;
      return snapshotFromDocument({ id, signatures: remote.signatures }, expected);
    },
    async cancelDocument() {},
  };
  return { provider, remote };
}

const input = {
  participacaoId: "p1",
  file: { bytes: new Uint8Array([1]), fileName: "c.pdf", mimeType: "application/pdf" },
  signers: [
    { role: "CONTRATADO" as const, name: "Ana", email: "Ana@x.com" },
    { role: "CONTRATANTE" as const, name: "VNH", email: "vnh@x.com" },
  ],
};
const ev = (id: string, type: string, sig?: string) => ({
  eventId: id,
  type,
  createdAt: null,
  documentId: "doc1",
  signatureId: sig ?? null,
});
const t = () => new Date("2026-10-08T12:00:00Z");

async function setup() {
  const m = memRepo();
  const p = fakeProvider();
  const deps = { repo: m.repo, provider: p.provider, now: t };
  const created = await createInfluencerContract(deps, input);
  return { ...m, ...p, deps, created };
}

describe("createInfluencerContract", () => {
  it("persiste id externo, sent_at e os dois signatários esperados", async () => {
    const { created, signers } = await setup();
    expect(created.contract).toMatchObject({ externalId: "doc1", status: "aguardando" });
    expect(created.contract.sentAt).toBe("2026-10-08T12:00:00.000Z");
    expect(signers.map((s) => [s.papel, s.emailNormalizado, s.externalId])).toEqual([
      ["CONTRATADO", "ana@x.com", "sig0"],
      ["CONTRATANTE", "vnh@x.com", "sig1"],
    ]);
  });

  it("barra segundo contrato ativo na mesma participação", async () => {
    const { deps } = await setup();
    await expect(createInfluencerContract(deps, input)).rejects.toBeInstanceOf(
      ActiveContractExistsError,
    );
  });

  it("falha definitiva do provedor cancela a linha e libera nova tentativa", async () => {
    const m = memRepo();
    const bad = fakeProvider({ createError: new SignatureProviderError("invalid_file", "x") });
    await expect(
      createInfluencerContract({ repo: m.repo, provider: bad.provider, now: t }, input),
    ).rejects.toThrow();
    expect(m.contracts[0].status).toBe("cancelado");
    const ok = fakeProvider();
    await expect(
      createInfluencerContract({ repo: m.repo, provider: ok.provider, now: t }, input),
    ).resolves.toBeTruthy();
  });

  it("timeout (ambíguo) mantém a linha pendente, sem cancelar", async () => {
    const m = memRepo();
    const bad = fakeProvider({ createError: new SignatureProviderError("timeout", "x", true) });
    await expect(
      createInfluencerContract({ repo: m.repo, provider: bad.provider, now: t }, input),
    ).rejects.toThrow();
    expect(m.contracts[0]).toMatchObject({ status: "aguardando", externalId: null, sentAt: null });
  });

  it("chamadas concorrentes: só uma chega ao provedor", async () => {
    const m = memRepo();
    const p = fakeProvider();
    let sends = 0;
    const orig = p.provider.createAndSend;
    p.provider.createAndSend = async (i) => {
      sends++;
      return orig(i);
    };
    const deps = { repo: m.repo, provider: p.provider, now: t };
    const r = await Promise.allSettled([
      createInfluencerContract(deps, input),
      createInfluencerContract(deps, input),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(sends).toBe(1);
  });

  it("falha ao persistir depois do envio expõe contrato e id externo", async () => {
    const m = memRepo();
    m.repo.insertSigners = async () => {
      throw new Error("db");
    };
    const p = fakeProvider();
    const err = await createInfluencerContract({ repo: m.repo, provider: p.provider }, input).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ContractPersistError);
    expect(err.externalId).toBe("doc1");
  });

  it("exige exatamente CONTRATADO e CONTRATANTE com e-mails distintos", async () => {
    const { deps } = await setup();
    await expect(
      createInfluencerContract(deps, {
        ...input,
        participacaoId: "p2",
        signers: [input.signers[0]],
      }),
    ).rejects.toThrow();
    await expect(
      createInfluencerContract(deps, {
        ...input,
        participacaoId: "p2",
        signers: [input.signers[0], { ...input.signers[1], email: " ANA@x.com" }],
      }),
    ).rejects.toThrow();
  });
});

describe("processAutentiqueEvent", () => {
  it("assina um → parcial; assina os dois → assinado (extra ignorada)", async () => {
    const s = await setup();
    s.remote.signatures[0].signed = { created_at: "2026-10-08T13:00:00Z" };
    expect(await processAutentiqueEvent(s.deps, ev("e1", "signature.accepted", "sig0"))).toBe(
      "reconciled",
    );
    expect(s.contracts[0].status).toBe("parcial");
    expect(s.signers[0]).toMatchObject({ status: "assinado", signedAt: "2026-10-08T13:00:00Z" });
    s.remote.signatures[1].signed = { created_at: "2026-10-08T14:00:00Z" };
    await processAutentiqueEvent(s.deps, ev("e2", "document.finished"));
    expect(s.contracts[0].status).toBe("assinado");
    expect(s.contracts[0].completedAt).toBeTruthy();
  });

  it("recusa vence", async () => {
    const s = await setup();
    s.remote.signatures[0].signed = { created_at: "x" };
    s.remote.signatures[1].rejected = { created_at: "y" };
    await processAutentiqueEvent(s.deps, ev("e1", "signature.rejected", "sig1"));
    expect(s.contracts[0].status).toBe("recusado");
    expect(s.contracts[0].rejectedAt).toBeTruthy();
  });

  it("evento duplicado não reprocessa", async () => {
    const s = await setup();
    await processAutentiqueEvent(s.deps, ev("e1", "signature.accepted", "sig0"));
    const calls = s.remote.calls;
    expect(await processAutentiqueEvent(s.deps, ev("e1", "signature.accepted", "sig0"))).toBe(
      "duplicate",
    );
    expect(s.remote.calls).toBe(calls);
  });

  it("fora de ordem converge para o estado real do provedor", async () => {
    const s = await setup();
    s.remote.signatures[0].signed = { created_at: "a" };
    s.remote.signatures[1].signed = { created_at: "b" };
    await processAutentiqueEvent(s.deps, ev("e2", "document.finished"));
    await processAutentiqueEvent(s.deps, ev("e1", "signature.accepted", "sig0")); // atrasado
    expect(s.contracts[0].status).toBe("assinado");
  });

  it("assinatura extra: reconcilia pelo snapshot, mas não muda estado nem cria signatário", async () => {
    const s = await setup();
    s.remote.signatures[2].signed = { created_at: "z" };
    expect(await processAutentiqueEvent(s.deps, ev("e1", "signature.accepted", "sigX"))).toBe(
      "reconciled",
    );
    expect(s.contracts[0].status).toBe("aguardando");
    expect(s.signers).toHaveLength(2);
  });

  it("viewed sem assinatura e tipos irrelevantes não mudam estado", async () => {
    const s = await setup();
    s.remote.signatures[0].viewed = { created_at: "v" };
    expect(await processAutentiqueEvent(s.deps, ev("e1", "signature.viewed", "sig0"))).toBe(
      "ignored_type",
    );
    expect(s.contracts[0].status).toBe("aguardando");
  });

  it("files.signed sem assinatura dos esperados não vira assinado", async () => {
    const s = await setup();
    s.provider.getDocument = async (id, exp) =>
      snapshotFromDocument({ id, files: { signed: "u" }, signatures: s.remote.signatures }, exp);
    await processAutentiqueEvent(s.deps, ev("e1", "document.finished"));
    expect(s.contracts[0].status).toBe("aguardando");
  });

  it("documento desconhecido é registrado sem erro", async () => {
    const s = await setup();
    const out = await processAutentiqueEvent(s.deps, {
      ...ev("e1", "document.finished"),
      documentId: "outro",
    });
    expect(out).toBe("unknown_contract");
  });

  it("falha do provedor lança e o retry reprocessa o mesmo evento", async () => {
    const s = await setup();
    const orig = s.provider.getDocument;
    s.provider.getDocument = async () => {
      throw new SignatureProviderError("unavailable", "x", true);
    };
    await expect(
      processAutentiqueEvent(s.deps, ev("e1", "signature.accepted", "sig0")),
    ).rejects.toThrow();
    s.provider.getDocument = orig;
    s.remote.signatures[0].signed = { created_at: "a" };
    expect(await processAutentiqueEvent(s.deps, ev("e1", "signature.accepted", "sig0"))).toBe(
      "reconciled",
    );
    expect(s.contracts[0].status).toBe("parcial");
  });

  it("signatário esperado ausente no provedor conta como pendente", async () => {
    const s = await setup();
    s.remote.signatures = [{ public_id: "sig0", email: "ana@x.com", signed: { created_at: "a" } }];
    await processAutentiqueEvent(s.deps, ev("e1", "signature.accepted", "sig0"));
    expect(s.contracts[0].status).toBe("parcial");
  });
});

describe("webhook HMAC + parse", () => {
  const body = JSON.stringify({
    event: {
      id: "evt",
      type: "signature.accepted",
      data: { object: { id: "sig0", document: "doc1" } },
    },
  });
  const sig = createHmac("sha256", "seg").update(body).digest("hex");
  it("aceita HMAC válido e recusa inválido/ausente", () => {
    expect(verifyAutentiqueSignature(body, sig, "seg")).toBe(true);
    expect(verifyAutentiqueSignature(body, sig, "outro")).toBe(false);
    expect(verifyAutentiqueSignature(body + " ", sig, "seg")).toBe(false);
    expect(verifyAutentiqueSignature(body, null, "seg")).toBe(false);
  });
  it("extrai ids do evento", () => {
    expect(parseAutentiqueEvent(JSON.parse(body))).toMatchObject({
      eventId: "evt",
      documentId: "doc1",
      signatureId: "sig0",
    });
  });
});

const PATH_SECRET = "p".repeat(40);
const HMACSEC = "segredo-de-teste";
const PATHAUTH = { method: "POST", pathSecret: PATH_SECRET, expectedPathSecret: PATH_SECRET };

describe("endpoint do webhook (handler)", () => {
  const SECRET = "segredo-de-teste";
  const payload = (id: string, type: string, sig?: string, doc = "doc1") =>
    JSON.stringify({
      event: {
        id,
        type,
        created_at: "2026-10-08T12:00:00Z",
        data: { object: sig ? { id: sig, document: doc } : { id: doc } },
      },
    });
  const sign = (b: string) => createHmac("sha256", SECRET).update(b).digest("hex");
  const call = (s: Awaited<ReturnType<typeof setup>>, body: string, header: string | null) =>
    handleAutentiqueWebhook({
      ...PATHAUTH,
      rawBody: body,
      signatureHeader: header,
      secrets: [SECRET],
      getDeps: async () => ({ repo: s.repo, provider: s.provider }),
    });

  it("A/B/C: HMAC válido aceita; inválido e corpo adulterado dão 401 sem tocar no banco", async () => {
    const s = await setup();
    const body = payload("e1", "signature.accepted", "sig0");
    expect((await call(s, body, sign(body))).status).toBe(200);
    let touched = false;
    const spy = async () => {
      touched = true;
      return { repo: s.repo, provider: s.provider };
    };
    const bad = await handleAutentiqueWebhook({
      ...PATHAUTH,
      rawBody: body,
      signatureHeader: "00",
      secrets: [SECRET],
      getDeps: spy,
    });
    const tampered = await handleAutentiqueWebhook({
      ...PATHAUTH,
      rawBody: body.replace("e1", "e2"),
      signatureHeader: sign(body),
      secrets: [SECRET],
      getDeps: spy,
    });
    expect([bad.status, tampered.status]).toEqual([401, 401]);
    expect(touched).toBe(false);
  });

  it("sem path secret configurado: 500; JSON/evento inválido: 400 (assinados)", async () => {
    const s = await setup();
    expect(
      (
        await handleAutentiqueWebhook({
          ...PATHAUTH,
          expectedPathSecret: undefined,
          rawBody: "{}",
          signatureHeader: "x",
          secrets: [HMACSEC],
          getDeps: async () => s,
        })
      ).status,
    ).toBe(500);
    expect((await call(s, "nao-json", sign("nao-json"))).status).toBe(400);
    expect((await call(s, "{}", sign("{}"))).status).toBe(400);
  });

  it("D/I: documento desconhecido responde 200 e fica registrado", async () => {
    const s = await setup();
    const body = payload("e1", "document.finished", undefined, "desconhecido");
    const r = await call(s, body, sign(body));
    expect(r).toMatchObject({ status: 200, body: { outcome: "unknown_contract" } });
    expect(s.events.get("autentique:e1")?.processed).toBe(true);
  });

  it("E: evento duplicado é idempotente", async () => {
    const s = await setup();
    const body = payload("e1", "signature.accepted", "sig0");
    s.remote.signatures[0].signed = { created_at: "a" };
    await call(s, body, sign(body));
    const calls = s.remote.calls;
    const r = await call(s, body, sign(body));
    expect(r).toMatchObject({ status: 200, body: { outcome: "duplicate" } });
    expect(s.remote.calls).toBe(calls);
    expect(s.events.size).toBe(1);
  });

  it("F: signature.accepted atualiza o signatário certo; contrato parcial", async () => {
    const s = await setup();
    s.remote.signatures[0].signed = { created_at: "2026-10-08T13:00:00Z" };
    const body = payload("e1", "signature.accepted", "sig0");
    await call(s, body, sign(body));
    expect(s.signers.map((x) => [x.papel, x.status])).toEqual([
      ["CONTRATADO", "assinado"],
      ["CONTRATANTE", "aguardando"],
    ]);
    expect(s.contracts[0].status).toBe("parcial");
  });

  it("G: signature.rejected recusa o signatário e o contrato", async () => {
    const s = await setup();
    s.remote.signatures[0].rejected = { created_at: "a" };
    const body = payload("e1", "signature.rejected", "sig0");
    await call(s, body, sign(body));
    expect(s.signers[0]).toMatchObject({ status: "recusado" });
    expect(s.signers[0].rejectedAt).toBeTruthy();
    expect(s.signers[1].status).toBe("aguardando");
    expect(s.contracts[0]).toMatchObject({ status: "recusado" });
    expect(s.contracts[0].rejectedAt).toBeTruthy();
  });

  it("H/ordem: document.finished antes de signature.accepted converge para assinado", async () => {
    const s = await setup();
    s.remote.signatures[0].signed = { created_at: "a" };
    s.remote.signatures[1].signed = { created_at: "b" };
    const fin = payload("e2", "document.finished");
    const acc = payload("e1", "signature.accepted", "sig0");
    await call(s, fin, sign(fin));
    expect(s.contracts[0].status).toBe("assinado");
    const done = s.contracts[0].completedAt;
    await call(s, acc, sign(acc)); // evento antigo depois do estado final
    expect(s.contracts[0]).toMatchObject({ status: "assinado", completedAt: done });
  });

  it("J: falha transitória do provedor responde 500 (retry); a reentrega conclui", async () => {
    const s = await setup();
    const ok = s.provider.getDocument;
    s.provider.getDocument = async () => {
      throw new SignatureProviderError("unavailable", "x", true);
    };
    const body = payload("e1", "signature.accepted", "sig0");
    expect((await call(s, body, sign(body))).status).toBe(500);
    s.provider.getDocument = ok;
    s.remote.signatures[0].signed = { created_at: "a" };
    expect((await call(s, body, sign(body))).status).toBe(200);
    expect(s.contracts[0].status).toBe("parcial");
  });

  it("object.id diferente do public_id NÃO vira assinatura extra: o snapshot atualiza o signatário", async () => {
    const s = await setup();
    s.remote.signatures[0].signed = { created_at: "2026-10-08T13:00:00Z" };
    const body = payload("e1", "signature.accepted", "id-do-evento-diferente-do-public-id");
    expect(await call(s, body, sign(body))).toMatchObject({
      status: 200,
      body: { outcome: "reconciled" },
    });
    expect(s.signers[0]).toMatchObject({ papel: "CONTRATADO", status: "assinado" });
    expect(s.contracts[0].status).toBe("parcial");
    expect(s.signers[0].externalId).toBe("sig0"); // vem do snapshot, não do evento
  });

  it("assinatura extra: 200, sem alterar signatários nem estado", async () => {
    const s = await setup();
    s.remote.signatures[2].signed = { created_at: "z" };
    const body = payload("e1", "signature.accepted", "sigX");
    expect(await call(s, body, sign(body))).toMatchObject({
      status: 200,
      body: { outcome: "reconciled" },
    });
    expect(s.contracts[0].status).toBe("aguardando");
    expect(s.signers).toHaveLength(2);
  });
});

describe("secrets por endpoint (Documento e Assinatura)", () => {
  const DOC = "secret-do-endpoint-documento";
  const SIG = "secret-do-endpoint-assinatura";
  const body = JSON.stringify({
    event: { id: "e1", type: "document.finished", data: { object: { id: "doc1" } } },
  });
  const hmac = (secret: string, b = body) => createHmac("sha256", secret).update(b).digest("hex");
  const run = (
    s: Awaited<ReturnType<typeof setup>>,
    header: string | null,
    secrets: string[],
    raw = body,
  ) =>
    handleAutentiqueWebhook({
      ...PATHAUTH,
      rawBody: raw,
      signatureHeader: header,
      secrets,
      getDeps: async () => ({ repo: s.repo, provider: s.provider }),
    });

  it("assinatura do secret DOCUMENT e do secret SIGNATURE são aceitas (ambos configurados)", async () => {
    const s = await setup();
    expect((await run(s, hmac(DOC), [DOC, SIG])).status).toBe(200);
    const b2 = body.replace("e1", "e2");
    expect((await run(s, hmac(SIG, b2), [DOC, SIG], b2)).status).toBe(200);
  });

  it("inválida, ausente, secret incorreto e corpo reformatado dão 401", async () => {
    const s = await setup();
    expect((await run(s, "ab".repeat(32), [DOC, SIG])).status).toBe(401);
    expect((await run(s, null, [DOC, SIG])).status).toBe(401);
    expect((await run(s, hmac("outro-secret"), [DOC, SIG])).status).toBe(401);
    // o HMAC é sobre o corpo CRU: o mesmo JSON reformatado muda a assinatura
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect((await run(s, hmac(DOC), [DOC, SIG], pretty)).status).toBe(401);
  });

  it("sem secrets HMAC mas com path secret: aceita sem header (HMAC é camada extra)", async () => {
    const s = await setup();
    expect((await run(s, null, [])).status).toBe(200);
    expect(verifyAutentiqueSignatureAny(body, hmac(""), ["", undefined, null])).toBe(false);
  });

  it("só um secret configurado: o outro endpoint é rejeitado", async () => {
    const s = await setup();
    expect((await run(s, hmac(DOC), [DOC])).status).toBe(200);
    expect((await run(s, hmac(SIG), [DOC])).status).toBe(401);
  });

  it("não expõe secrets nem o header na resposta", async () => {
    const s = await setup();
    const header = hmac("outro");
    const r = await run(s, header, [DOC, SIG]);
    const text = JSON.stringify(r);
    expect(text).not.toContain(DOC);
    expect(text).not.toContain(SIG);
    expect(text).not.toContain(header);
  });

  it("evento autenticado chega à reconciliação existente", async () => {
    const s = await setup();
    s.remote.signatures[0].signed = { created_at: "a" };
    s.remote.signatures[1].signed = { created_at: "b" };
    const r = await run(s, hmac(DOC), [DOC, SIG]);
    expect(r).toMatchObject({ status: 200, body: { outcome: "reconciled" } });
    expect(s.contracts[0].status).toBe("assinado");
  });

  it("lê os dois secrets do ambiente, sem vazios nem repetidos, ignorando o legado", () => {
    expect(
      autentiqueWebhookSecretsFromEnv({
        AUTENTIQUE_WEBHOOK_SECRET_DOCUMENT: " a ",
        AUTENTIQUE_WEBHOOK_SECRET_SIGNATURE: "b",
        AUTENTIQUE_WEBHOOK_SECRET: "legado",
      }),
    ).toEqual(["a", "b"]);
    expect(
      autentiqueWebhookSecretsFromEnv({
        AUTENTIQUE_WEBHOOK_SECRET_DOCUMENT: "x",
        AUTENTIQUE_WEBHOOK_SECRET_SIGNATURE: "x",
      }),
    ).toEqual(["x"]);
    expect(autentiqueWebhookSecretsFromEnv({ AUTENTIQUE_WEBHOOK_SECRET: "legado" })).toEqual([]);
  });

  it("a comparação continua em tempo constante (timingSafeEqual) e o HMAC é sobre o corpo cru", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./autentique-webhook.ts", import.meta.url), "utf8");
    expect(src).toContain("timingSafeEqual");
    expect(src).toMatch(/createHmac\("sha256", secret\)\.update\(rawBody, "utf8"\)/);
    expect(verifyAutentiqueSignature(body, hmac(DOC), DOC)).toBe(true);
  });
});

describe("segredo no caminho da URL (autenticação obrigatória)", () => {
  const body = JSON.stringify({
    event: { id: "e1", type: "document.finished", data: { object: { id: "doc1" } } },
  });
  const hmac = (secret: string) => createHmac("sha256", secret).update(body).digest("hex");
  const run = (
    s: Awaited<ReturnType<typeof setup>>,
    o: Partial<Parameters<typeof handleAutentiqueWebhook>[0]> = {},
  ) =>
    handleAutentiqueWebhook({
      ...PATHAUTH,
      rawBody: body,
      signatureHeader: null,
      secrets: [],
      getDeps: async () => ({ repo: s.repo, provider: s.provider }),
      ...o,
    });

  it("path secret correto passa e reconcilia; sem HMAC não bloqueia", async () => {
    const s = await setup();
    s.remote.signatures[0].signed = { created_at: "a" };
    s.remote.signatures[1].signed = { created_at: "b" };
    expect(await run(s)).toMatchObject({ status: 200, body: { outcome: "reconciled" } });
    expect(s.contracts[0].status).toBe("assinado");
  });

  it("ausente ou incorreto: 404, sem tocar em banco/provedor", async () => {
    const s = await setup();
    let touched = false;
    const getDeps = async () => {
      touched = true;
      return { repo: s.repo, provider: s.provider };
    };
    expect((await run(s, { pathSecret: undefined, getDeps })).status).toBe(404);
    expect((await run(s, { pathSecret: "", getDeps })).status).toBe(404);
    expect((await run(s, { pathSecret: "x".repeat(40), getDeps })).status).toBe(404);
    expect((await run(s, { pathSecret: PATH_SECRET.slice(0, -1), getDeps })).status).toBe(404);
    expect(touched).toBe(false);
  });

  it("método diferente de POST é rejeitado", async () => {
    const s = await setup();
    for (const method of ["GET", "PUT", "DELETE"])
      expect((await run(s, { method })).status).toBe(405);
  });

  it("path secret não configurado ou curto demais: 500 (nunca aberto)", async () => {
    const s = await setup();
    expect((await run(s, { expectedPathSecret: undefined, pathSecret: "" })).status).toBe(500);
    expect((await run(s, { expectedPathSecret: "curto", pathSecret: "curto" })).status).toBe(500);
  });

  it("HMAC configurado continua exigido como camada extra", async () => {
    const s = await setup();
    expect((await run(s, { secrets: [HMACSEC] })).status).toBe(401);
    expect((await run(s, { secrets: [HMACSEC], signatureHeader: hmac("errado") })).status).toBe(
      401,
    );
    expect((await run(s, { secrets: [HMACSEC], signatureHeader: hmac(HMACSEC) })).status).toBe(200);
  });

  it("HMAC válido sem path secret correto ainda é rejeitado", async () => {
    const s = await setup();
    expect(
      (
        await run(s, {
          pathSecret: "x".repeat(40),
          secrets: [HMACSEC],
          signatureHeader: hmac(HMACSEC),
        })
      ).status,
    ).toBe(404);
  });

  it("não expõe o path secret nem HMAC nas respostas", async () => {
    const s = await setup();
    const rs = [
      await run(s, { pathSecret: "x".repeat(40) }),
      await run(s, { expectedPathSecret: undefined }),
      await run(s, { secrets: [HMACSEC] }),
    ];
    const text = JSON.stringify(rs);
    expect(text).not.toContain(PATH_SECRET);
    expect(text).not.toContain(HMACSEC);
  });

  it("pathSecretMatches usa timingSafeEqual", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./autentique-webhook.ts", import.meta.url), "utf8");
    expect(src).toMatch(/pathSecretMatches[\s\S]*timingSafeEqual/);
  });
});
