import {
  SignatureProviderError,
  type CreateSignatureDocumentInput,
  type CreatedSignatureDocument,
  type ProviderSigner,
  type SignatureDocumentSnapshot,
  type SignatureProvider,
  type SignerSpec,
} from "./signature-provider";
import { snapshotFromDocument } from "./autentique-status";

/**
 * Cliente do Autentique (GraphQL, `https://api.autentique.com.br/v2/graphql`). SOMENTE servidor:
 * o token vem de `AUTENTIQUE_API_TOKEN` e nunca aparece em log, erro ou resposta. Mensagens de
 * erro são códigos estáveis — nada de texto do provedor, conteúdo de documento ou token.
 */

export const AUTENTIQUE_ENDPOINT = "https://api.autentique.com.br/v2/graphql";
const TIMEOUT_MS = 25_000;

type Fetch = typeof fetch;

const createDocumentMutation = (
  sandbox: boolean,
) => `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
  createDocument(sandbox: ${sandbox ? "true" : "false"}, document: $document, signers: $signers, file: $file) {
    id
    name
    signatures { public_id name email action { name } user { id } link { short_link } }
  }
}`;

/** O id real do documento NÃO é UUID (o createDocument devolve ~50 caracteres hexadecimais). O id entra
 * no texto da query, então só passa um formato "seguro": letras, números, `_` e `-` — nada que feche
 * aspas ou abra um campo GraphQL. */
const DOCUMENT_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
function assertDocumentId(id: string): string {
  if (!DOCUMENT_ID_RE.test(id))
    throw new SignatureProviderError("not_found", "Identificador de documento inválido.");
  return id;
}

const getDocumentQuery = (id: string) => `query {
  document(id: "${assertDocumentId(id)}") {
    id
    files { signed }
    signatures {
      public_id
      email
      viewed { created_at }
      signed { created_at }
      rejected { created_at }
    }
  }
}`;

const deleteDocumentMutation = (id: string) =>
  `mutation { deleteDocument(id: "${assertDocumentId(id)}") }`;

/** Converte erros do provedor em códigos nossos (sem repassar o texto dele). */
export function mapAutentiqueErrors(
  errors: Array<{ message?: string; extensions?: { validation?: Record<string, unknown> } }>,
): SignatureProviderError {
  const text = JSON.stringify(errors.map((e) => [e.message, e.extensions?.validation ?? null]));
  const has = (s: string) => text.includes(s);
  if (has("unauthorized") || has("Unauthenticated")) {
    return new SignatureProviderError(
      "unauthorized",
      "Credencial do provedor de assinatura inválida.",
    );
  }
  if (has("unavailable_credits")) {
    return new SignatureProviderError(
      "no_credits",
      "O plano do provedor não tem documentos disponíveis.",
    );
  }
  if (has("must_be_a_valid_email_address") || has("sms_delivery_not_allowed")) {
    return new SignatureProviderError(
      "invalid_signer",
      "Dados de signatário recusados pelo provedor.",
    );
  }
  if (has("must_be_a_valid_file") || has("failed_to_upload") || has("could_not_upload_file")) {
    return new SignatureProviderError("invalid_file", "Arquivo recusado pelo provedor.");
  }
  if (has("document_not_found")) {
    return new SignatureProviderError("not_found", "Documento não encontrado no provedor.");
  }
  return new SignatureProviderError("rejected_by_provider", "O provedor recusou a solicitação.");
}

function signerInput(
  s: SignerSpec,
  positions?: CreateSignatureDocumentInput["signaturePositions"],
) {
  const pos = positions?.[s.role];
  return {
    name: s.name,
    email: s.email,
    action: "SIGN",
    ...(s.cpf ? { configs: { cpf: s.cpf } } : {}),
    ...(pos
      ? {
          positions: [{ element: "SIGNATURE", x: String(pos.x), y: String(pos.y), z: pos.page }],
        }
      : {}),
    ...(s.extraVerification === "sms"
      ? { security_verifications: [{ type: "SMS", ...(s.phone ? { verify_phone: s.phone } : {}) }] }
      : {}),
  };
}

/** Diagnóstico SANITIZADO de uma resposta de erro (só para scripts de smoke; nunca em produção). */
export type ErrorDiagnostic = {
  httpStatus: number | null;
  graphqlCodes: string[];
  messages: string[];
  /** Chaves de topo da resposta, para entender a estrutura sem expor valores. */
  responseKeys: string[];
};

const clean = (v: unknown): string =>
  String(v)
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/Bearer\s+\S+/gi, "Bearer [oculto]")
    .replace(/[A-Za-z0-9_\-+/=]{24,}/g, "[oculto]")
    .slice(0, 200);

/** Extrai só status, códigos, mensagens (limpas e truncadas) e chaves de topo. Nunca lança. */
export function sanitizeErrorDiagnostic(httpStatus: number | null, body: unknown): ErrorDiagnostic {
  const out: ErrorDiagnostic = { httpStatus, graphqlCodes: [], messages: [], responseKeys: [] };
  if (!body || typeof body !== "object") return out;
  const b = body as { errors?: unknown; message?: unknown; error?: unknown };
  out.responseKeys = Object.keys(b).slice(0, 10);
  if (typeof b.message === "string") out.messages.push(clean(b.message));
  if (typeof b.error === "string") out.messages.push(clean(b.error));
  if (Array.isArray(b.errors)) {
    for (const e of b.errors.slice(0, 5)) {
      if (!e || typeof e !== "object") continue;
      const g = e as { message?: unknown; extensions?: { code?: unknown; category?: unknown } };
      if (typeof g.message === "string") out.messages.push(clean(g.message));
      for (const c of [g.extensions?.code, g.extensions?.category])
        if (typeof c === "string") out.graphqlCodes.push(clean(c));
    }
  }
  return out;
}

export class AutentiqueProvider implements SignatureProvider {
  readonly name = "autentique";

  constructor(
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly endpoint = AUTENTIQUE_ENDPOINT,
    /** Diagnóstico: recebe o `data` bruto de cada resposta (o chamador decide mascarar). Nunca em produção. */
    private readonly onRawData?: (operation: string, data: unknown) => void,
    /** Diagnóstico: recebe um resumo SANITIZADO de respostas de erro. Opt-in; não altera o fluxo. */
    private readonly onErrorDiagnostic?: (d: ErrorDiagnostic) => void,
  ) {}

  private report(status: number | null, body: unknown) {
    try {
      this.onErrorDiagnostic?.(sanitizeErrorDiagnostic(status, body));
    } catch {
      /* diagnóstico nunca interfere no fluxo */
    }
  }

  private async send(body: BodyInit | string, headers: Record<string, string> = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, ...headers },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        throw new SignatureProviderError(
          "timeout",
          "O provedor demorou demais para responder.",
          true,
        );
      }
      throw new SignatureProviderError("unavailable", "Provedor de assinatura indisponível.", true);
    } finally {
      clearTimeout(timer);
    }
    if (
      this.onErrorDiagnostic &&
      (res.status === 429 || res.status === 401 || res.status === 403 || res.status >= 500)
    ) {
      this.report(res.status, await res.json().catch(() => null));
    }
    if (res.status === 429)
      throw new SignatureProviderError("rate_limited", "Limite de requisições do provedor.", true);
    if (res.status === 401 || res.status === 403)
      throw new SignatureProviderError(
        "unauthorized",
        "Credencial do provedor de assinatura inválida.",
      );
    if (res.status >= 500)
      throw new SignatureProviderError("unavailable", "Provedor de assinatura indisponível.", true);
    let json: { data?: unknown; errors?: Parameters<typeof mapAutentiqueErrors>[0] };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      throw new SignatureProviderError("unavailable", "Resposta inválida do provedor.", true);
    }
    // GraphQL pode responder 200 com `errors`.
    if (json.errors && json.errors.length > 0) {
      this.report(res.status, json);
      throw mapAutentiqueErrors(json.errors);
    }
    this.onRawData?.("graphql", json.data);
    return json.data as Record<string, unknown>;
  }

  private json(query: string, variables: Record<string, unknown>) {
    return this.send(JSON.stringify({ query, variables }), { "Content-Type": "application/json" });
  }

  async createAndSend(input: CreateSignatureDocumentInput): Promise<CreatedSignatureDocument> {
    const form = new FormData();
    form.append(
      "operations",
      JSON.stringify({
        query: createDocumentMutation(input.sandbox === true),
        variables: {
          document: {
            name: input.name,
            sortable: input.sequential,
            refusable: true,
            ...(input.message ? { message: input.message } : {}),
          },
          signers: input.signers.map((s) => signerInput(s, input.signaturePositions)),
          file: null,
        },
      }),
    );
    form.append("map", JSON.stringify({ file: ["variables.file"] }));
    form.append(
      "file",
      new Blob([input.file.bytes as BlobPart], { type: input.file.mimeType }),
      input.file.fileName,
    );
    // Sem Content-Type: o fetch monta o boundary do multipart sozinho.
    const data = await this.send(form);
    const doc = data?.createDocument as
      | {
          id: string;
          signatures?: Array<{
            public_id: string;
            name?: string | null;
            email?: string | null;
            action?: { name?: string | null } | null;
            user?: { id?: string | null } | null;
            link?: { short_link?: string | null } | null;
          }>;
        }
      | undefined;
    if (!doc?.id) {
      throw new SignatureProviderError(
        "rejected_by_provider",
        "O provedor não devolveu o documento.",
      );
    }
    const byEmail = new Map(input.signers.map((s) => [s.email.toLowerCase(), s.role]));
    const signers: ProviderSigner[] = (doc.signatures ?? []).map((s) => ({
      externalId: s.public_id,
      role: s.email ? (byEmail.get(s.email.toLowerCase()) ?? null) : null,
      name: s.name ?? null,
      email: s.email ?? null,
      action: s.action?.name ?? null,
      hasAccount: !!s.user?.id,
      link: s.link?.short_link ?? null,
    }));
    return { externalId: doc.id, signers };
  }

  async getDocument(
    externalId: string,
    expectedEmails: readonly string[],
  ): Promise<SignatureDocumentSnapshot> {
    const data = await this.json(getDocumentQuery(externalId), {});
    const doc = data?.document as Parameters<typeof snapshotFromDocument>[0] | null | undefined;
    if (!doc)
      throw new SignatureProviderError("not_found", "Documento não encontrado no provedor.");
    return snapshotFromDocument(doc, expectedEmails);
  }

  async cancelDocument(externalId: string): Promise<void> {
    await this.json(deleteDocumentMutation(externalId), {});
  }
}

/** Provedor configurado pelo ambiente. Lança `not_configured` se o token não existir. */
export function getSignatureProvider(): SignatureProvider {
  const token = process.env.AUTENTIQUE_API_TOKEN?.trim();
  if (!token) {
    throw new SignatureProviderError(
      "not_configured",
      "Provedor de assinatura não configurado (AUTENTIQUE_API_TOKEN).",
    );
  }
  return new AutentiqueProvider(token);
}
