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
    const snap = await provider(f as unknown as typeof fetch).getDocument(DOC_ID, [
      "a@x.com",
      "b@x.com",
    ]);
    expect(snap.state).toBe("parcial");
    expect(snap.signers[0]).toMatchObject({ viewed: true, signed: true, signedAt: "t2" });
  });

  it("aceita o id real (50 hex) e recusa qualquer coisa que feche aspas ou abra campos", async () => {
    const f = vi.fn();
    await expect(
      provider(f as unknown as typeof fetch).getDocument('x") { id } #', []),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      provider(f as unknown as typeof fetch).cancelDocument("../../x"),
    ).rejects.toBeInstanceOf(SignatureProviderError);
    for (const bad of ['a"b', "a b", "a{b}", "a\nb", "", "ab", "x".repeat(200)]) {
      await expect(
        provider(f as unknown as typeof fetch).getDocument(bad, []),
      ).rejects.toMatchObject({
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
    await provider(f as unknown as typeof fetch).getDocument(DOC_ID, []);
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

describe("estado derivado (só os signatários ESPERADOS)", () => {
  const ev = { created_at: "2026-10-08T17:13:20Z" };
  const sig = (
    id: string,
    email: string,
    o: { viewed?: boolean; signed?: boolean; rejected?: boolean } = {},
  ) => ({
    public_id: id,
    email,
    viewed: o.viewed ? ev : null,
    signed: o.signed ? ev : null,
    rejected: o.rejected ? ev : null,
  });
  const EXP = ["contratado@x.com", "contratante@x.com"];
  const EXTRA = sig("extra", "outro@vocenohype.com.br");
  const doc = (signatures: ReturnType<typeof sig>[], files?: { signed?: string | null }) =>
    snapshotFromDocument({ id: DOC_ID, signatures, files }, EXP);

  it("2 esperados, nenhum assinado → aguardando", () => {
    expect(doc([sig("a", EXP[0]), sig("b", EXP[1])]).state).toBe("aguardando");
  });
  it("1 esperado assinou → parcial", () => {
    expect(doc([sig("a", EXP[0], { signed: true }), sig("b", EXP[1])]).state).toBe("parcial");
  });
  it("2 esperados assinaram + 1 assinatura extra pendente → assinado (caso real)", () => {
    const s = doc([EXTRA, sig("a", EXP[0], { signed: true }), sig("b", EXP[1], { signed: true })]);
    expect(s.state).toBe("assinado");
    expect(s.signers).toHaveLength(2);
    expect(s.unmatchedSignatures.map((x) => x.externalId)).toEqual(["extra"]);
    expect(s.unmatchedSignatures[0].signed).toBe(false);
  });
  it("1 esperado recusou → recusado (mesmo que o outro tenha assinado)", () => {
    expect(
      doc([sig("a", EXP[0], { signed: true }), sig("b", EXP[1], { rejected: true })]).state,
    ).toBe("recusado");
    expect(doc([sig("a", EXP[0], { rejected: true }), sig("b", EXP[1])]).state).toBe("recusado");
  });
  it("assinatura extra isolada não altera o estado (nem assinada, nem recusada)", () => {
    expect(doc([sig("a", EXP[0]), sig("b", EXP[1]), EXTRA]).state).toBe("aguardando");
    expect(doc([sig("a", EXP[0]), sig("b", EXP[1]), { ...EXTRA, signed: ev }]).state).toBe(
      "aguardando",
    );
    expect(doc([sig("a", EXP[0]), sig("b", EXP[1]), { ...EXTRA, rejected: ev }]).state).toBe(
      "aguardando",
    );
    expect(doc([EXTRA]).state).toBe("aguardando");
  });
  it("viewed sem assinatura não altera o estado", () => {
    expect(
      doc([sig("a", EXP[0], { viewed: true }), sig("b", EXP[1], { viewed: true })]).state,
    ).toBe("aguardando");
    const s = doc([
      sig("a", EXP[0], { viewed: true, signed: true }),
      sig("b", EXP[1], { viewed: true }),
    ]);
    expect(s.state).toBe("parcial");
    expect(s.signers[0].viewed).toBe(true);
  });
  it("files.signed presente sem assinaturas não significa assinado", () => {
    const s = doc([], { signed: "https://arquivo/assinado.pdf" });
    expect(s.state).toBe("aguardando");
    expect(s.signedFileUrl).toBe("https://arquivo/assinado.pdf");
    expect(doc([sig("a", EXP[0]), sig("b", EXP[1])], { signed: "https://x" }).state).toBe(
      "aguardando",
    );
  });
  it("e-mail casa normalizado (caixa e espaços)", () => {
    const s = snapshotFromDocument(
      {
        id: DOC_ID,
        signatures: [
          sig("a", "  Contratado@X.com ", { signed: true }),
          sig("b", "CONTRATANTE@x.com", { signed: true }),
        ],
      },
      EXP,
    );
    expect(s.state).toBe("assinado");
    expect(s.unmatchedSignatures).toEqual([]);
  });
  it("esperado ausente da resposta conta como pendente", () => {
    const s = doc([sig("a", EXP[0], { signed: true })]);
    expect(s.state).toBe("parcial");
    expect(s.signers[1]).toMatchObject({ externalId: "", signed: false });
  });
  it("sem esperados, nada é 'assinado' por engano", () => {
    expect(deriveDocumentState([])).toBe("aguardando");
    expect(snapshotFromDocument({ id: "d" }, []).state).toBe("aguardando");
  });
  it("cancelado vence (documento apagado)", () => {
    expect(snapshotFromDocument({ id: "d", deleted_at: "t", signatures: [] }, EXP).state).toBe(
      "cancelado",
    );
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
