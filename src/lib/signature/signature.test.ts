import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AutentiqueProvider, mapAutentiqueErrors } from "./autentique.server";
import { deriveDocumentState, snapshotFromDocument } from "./autentique-status";
import {
  parseAutentiqueEvent,
  suggestedStateFromEvent,
  verifyAutentiqueSignature,
} from "./autentique-webhook";
import { buildMinimalPdf } from "./minimal-pdf";
import { SignatureProviderError } from "./signature-provider";

const TOKEN = "tok_SUPER_SECRET_123";
// Formato REAL devolvido pelo createDocument: ~50 caracteres hexadecimais (não é UUID).
const DOC_ID = "65369b2ea60365590a02f70b888ad48f155bb35837ecc89b5";

const okJson = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });

function provider(fetchImpl: typeof fetch) {
  return new AutentiqueProvider(TOKEN, fetchImpl, "https://example.test/graphql");
}

const input = {
  name: "VNH-123",
  sandbox: true,
  sequential: true,
  file: { bytes: buildMinimalPdf(["x"]), fileName: "c.pdf", mimeType: "application/pdf" },
  signers: [
    { role: "CONTRATADO" as const, name: "A", email: "a@x.com", cpf: "12345678909" },
    { role: "CONTRATANTE" as const, name: "B", email: "b@x.com" },
  ],
};

describe("criar documento", () => {
  it("monta multipart (operations/map/file), usa sandbox e devolve ids + papéis", async () => {
    const spy = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
      expect((init!.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
      const form = init!.body as FormData;
      const ops = JSON.parse(form.get("operations") as string);
      expect(ops.query).toContain("sandbox: true");
      expect(ops.variables.file).toBeNull();
      expect(ops.variables.document).toMatchObject({
        name: "VNH-123",
        sortable: true,
        refusable: true,
      });
      expect(ops.variables.signers[0]).toMatchObject({
        email: "a@x.com",
        action: "SIGN",
        configs: { cpf: "12345678909" },
      });
      expect(ops.variables.signers[1].configs).toBeUndefined();
      expect(JSON.parse(form.get("map") as string)).toEqual({ file: ["variables.file"] });
      expect(form.get("file")).toBeInstanceOf(Blob);
      return okJson({
        createDocument: {
          id: DOC_ID,
          signatures: [
            { public_id: "s1", email: "A@x.com", link: null },
            { public_id: "s2", email: "b@x.com", link: { short_link: "https://a.im/x" } },
          ],
        },
      });
    });
    const r = await provider(spy as unknown as typeof fetch).createAndSend(input);
    expect(r.externalId).toBe(DOC_ID);
    expect(r.signers).toEqual([
      {
        externalId: "s1",
        role: "CONTRATADO",
        name: null,
        email: "A@x.com",
        action: null,
        hasAccount: false,
        link: null,
      },
      {
        externalId: "s2",
        role: "CONTRATANTE",
        name: null,
        email: "b@x.com",
        action: null,
        hasAccount: false,
        link: "https://a.im/x",
      },
    ]);
  });

  it("sandbox desligado vira `sandbox: false` e nunca depende de variável", async () => {
    const spy = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const ops = JSON.parse((init!.body as FormData).get("operations") as string);
      expect(ops.query).toContain("sandbox: false");
      return okJson({ createDocument: { id: DOC_ID, signatures: [] } });
    });
    await provider(spy as unknown as typeof fetch).createAndSend({ ...input, sandbox: false });
  });
});

describe("consulta e cancelamento", () => {
  it("deriva o estado dos eventos dos signatários", async () => {
    const f = vi.fn(async () =>
      okJson({
        document: {
          id: DOC_ID,
          deleted_at: null,
          files: { signed: null },
          signatures: [
            {
              public_id: "s1",
              email: "a@x.com",
              viewed: { created_at: "t" },
              signed: { created_at: "t2" },
              rejected: null,
            },
            { public_id: "s2", email: "b@x.com", viewed: null, signed: null, rejected: null },
          ],
        },
      }),
    );
    const snap = await provider(f as unknown as typeof fetch).getDocument(DOC_ID);
    expect(snap.state).toBe("parcial");
    expect(snap.signers[0]).toMatchObject({ viewed: true, signed: true, signedAt: "t2" });
  });

  it("aceita o id real (50 hex) e recusa qualquer coisa que feche aspas ou abra campos", async () => {
    const f = vi.fn();
    await expect(
      provider(f as unknown as typeof fetch).getDocument('x") { id } #'),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      provider(f as unknown as typeof fetch).cancelDocument("../../x"),
    ).rejects.toBeInstanceOf(SignatureProviderError);
    for (const bad of ['a"b', "a b", "a{b}", "a\nb", "", "ab", "x".repeat(200)]) {
      await expect(provider(f as unknown as typeof fetch).getDocument(bad)).rejects.toMatchObject({
        code: "not_found",
      });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("assinatura que não é de nenhum signatário nosso fica com papel null (e dados para diagnóstico)", async () => {
    const f = vi.fn(async () =>
      okJson({
        createDocument: {
          id: DOC_ID,
          signatures: [
            {
              public_id: "s0",
              name: "Dono da conta",
              email: "dono@conta.com",
              action: { name: "SIGN" },
              user: { id: "u1" },
              link: null,
            },
            {
              public_id: "s1",
              name: "A",
              email: "a@x.com",
              action: { name: "SIGN" },
              user: null,
              link: null,
            },
          ],
        },
      }),
    );
    const r = await provider(f as unknown as typeof fetch).createAndSend(input);
    expect(r.signers[0]).toMatchObject({
      role: null,
      name: "Dono da conta",
      action: "SIGN",
      hasAccount: true,
    });
    expect(r.signers[1]).toMatchObject({ role: "CONTRATADO", hasAccount: false });
  });

  it("a consulta usa o id real e só campos documentados", async () => {
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const q = JSON.parse(String(init!.body)).query as string;
      expect(q).toContain(`document(id: "${DOC_ID}")`);
      expect(q).not.toContain("deleted_at");
      return okJson({ document: { id: DOC_ID, signatures: [] } });
    });
    await provider(f as unknown as typeof fetch).getDocument(DOC_ID);
  });

  it("cancelar chama deleteDocument", async () => {
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      expect(String(init!.body)).toContain(`deleteDocument(id: \\"${DOC_ID}\\")`);
      return okJson({ deleteDocument: true });
    });
    await provider(f as unknown as typeof fetch).cancelDocument(DOC_ID);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("falhas (sem vazar token nem texto do provedor)", () => {
  const run = (f: () => Promise<Response>) =>
    provider(f as unknown as typeof fetch)
      .createAndSend(input)
      .then(
        () => null,
        (e: SignatureProviderError) => e,
      );

  it("429 → rate_limited (repetível)", async () => {
    const e = await run(async () => new Response("{}", { status: 429 }));
    expect(e).toMatchObject({ code: "rate_limited", retryable: true });
  });
  it("401 → unauthorized (não repetível)", async () => {
    const e = await run(async () => new Response("{}", { status: 401 }));
    expect(e).toMatchObject({ code: "unauthorized", retryable: false });
  });
  it("500 e rede → unavailable (repetível)", async () => {
    expect(await run(async () => new Response("x", { status: 502 }))).toMatchObject({
      code: "unavailable",
      retryable: true,
    });
    expect(
      await run(async () => {
        throw new TypeError("fetch failed");
      }),
    ).toMatchObject({ code: "unavailable", retryable: true });
  });
  it("timeout → timeout (repetível)", async () => {
    const e = await run(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    expect(e).toMatchObject({ code: "timeout", retryable: true });
  });
  it("200 com errors do GraphQL é tratado como erro", async () => {
    const mk = (validation: string) => async () =>
      new Response(
        JSON.stringify({
          errors: [
            {
              message: "validation",
              extensions: { validation: { "signers.0.email": [validation] } },
            },
          ],
        }),
        { status: 200 },
      );
    expect(await run(mk("must_be_a_valid_email_address"))).toMatchObject({
      code: "invalid_signer",
    });
    expect(await run(mk("unavailable_credits"))).toMatchObject({ code: "no_credits" });
    expect(await run(mk("must_be_a_valid_file"))).toMatchObject({ code: "invalid_file" });
    expect(await run(mk("algo_novo"))).toMatchObject({ code: "rejected_by_provider" });
  });
  it("nenhuma mensagem de erro contém o token", async () => {
    const e = await run(async () => new Response("{}", { status: 401 }));
    expect(JSON.stringify([e!.message, e!.code])).not.toContain(TOKEN);
    expect(mapAutentiqueErrors([{ message: `bad ${TOKEN}` }]).message).not.toContain(TOKEN);
  });
});

describe("estado derivado", () => {
  const s = (signed: boolean, rejected = false) => ({ signed, rejected });
  it("regras", () => {
    expect(deriveDocumentState([s(false), s(false)])).toBe("aguardando");
    expect(deriveDocumentState([s(true), s(false)])).toBe("parcial");
    expect(deriveDocumentState([s(true), s(true)])).toBe("assinado");
    expect(deriveDocumentState([s(true), s(false, true)])).toBe("recusado");
    expect(deriveDocumentState([s(true), s(true)], { deleted: true })).toBe("cancelado");
    expect(deriveDocumentState([])).toBe("aguardando");
  });
  it("snapshot é defensivo com campos ausentes", () => {
    const snap = snapshotFromDocument({ id: "d" });
    expect(snap).toMatchObject({ state: "aguardando", signers: [], signedFileUrl: null });
  });
});

describe("webhook", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ event: { id: "e1", type: "signature.accepted" } });
  const sig = createHmac("sha256", secret).update(body).digest("hex");

  it("assinatura válida passa; adulterada, ausente ou sem segredo é recusada", () => {
    expect(verifyAutentiqueSignature(body, sig, secret)).toBe(true);
    expect(verifyAutentiqueSignature(body, `sha256=${sig}`, secret)).toBe(true);
    expect(verifyAutentiqueSignature(body + " ", sig, secret)).toBe(false);
    expect(verifyAutentiqueSignature(body, sig.replace(/.$/, "0"), secret)).toBe(false);
    expect(verifyAutentiqueSignature(body, null, secret)).toBe(false);
    expect(verifyAutentiqueSignature(body, sig, undefined)).toBe(false);
    expect(verifyAutentiqueSignature(body, "curto", secret)).toBe(false);
  });
  it("extrai evento, documento e assinatura; payload estranho vira null", () => {
    expect(
      parseAutentiqueEvent({
        event: {
          id: "e1",
          type: "document.finished",
          created_at: "t",
          data: { object: { id: DOC_ID } },
        },
      }),
    ).toEqual({
      eventId: "e1",
      type: "document.finished",
      createdAt: "t",
      documentId: DOC_ID,
      signatureId: null,
    });
    expect(
      parseAutentiqueEvent({
        event: {
          id: "e2",
          type: "signature.accepted",
          data: { object: { id: "s1", document: { id: DOC_ID } } },
        },
      }),
    ).toMatchObject({ documentId: DOC_ID, signatureId: "s1" });
    expect(parseAutentiqueEvent(null)).toBeNull();
    expect(parseAutentiqueEvent({ event: { type: "x" } })).toBeNull();
    expect(parseAutentiqueEvent("x")).toBeNull();
  });
  it("estado sugerido por evento (a decisão final consulta o documento)", () => {
    expect(suggestedStateFromEvent("document.finished")).toBe("assinado");
    expect(suggestedStateFromEvent("signature.rejected")).toBe("recusado");
    expect(suggestedStateFromEvent("document.deleted")).toBe("cancelado");
    expect(suggestedStateFromEvent("signature.viewed")).toBeNull();
  });
});

describe("PDF de teste", () => {
  it("começa com %PDF e termina com %%EOF", () => {
    const t = new TextDecoder().decode(buildMinimalPdf(["Olá (teste)"]));
    expect(t.startsWith("%PDF-1.4")).toBe(true);
    expect(t.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(t).toContain("Ola \\(teste\\)");
  });
});
