import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SignatureDocumentState } from "./signature-provider";

/**
 * Webhook do Autentique: POST JSON com um evento; assinatura HMAC-SHA256 (hex) do corpo CRU no
 * header `x-autentique-signature`, calculada com o segredo do endpoint cadastrado no painel.
 * Puro (só `node:crypto`): o chamador entrega o corpo cru, o header e o segredo.
 */

/** Confere a assinatura em tempo constante. Sem header, sem segredo ou tamanho diferente → recusa. */
export function verifyAutentiqueSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  // tolera um eventual prefixo "sha256=" (não documentado, mas inofensivo)
  const received = signatureHeader
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * O Autentique gera um secret POR endpoint (createEndpoint) e não o mostra de novo; nosso único
 * endpoint HTTP recebe os dois cadastros (Documento e Assinatura). A requisição é válida se o HMAC
 * do corpo CRU bater com QUALQUER secret configurado. Todos os secrets são avaliados (sem sair no
 * primeiro acerto) e nenhum valor é registrado ou devolvido. Sem secrets → nunca válido.
 */
export function verifyAutentiqueSignatureAny(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secrets: ReadonlyArray<string | null | undefined>,
): boolean {
  let valid = false;
  for (const secret of secrets) {
    if (verifyAutentiqueSignature(rawBody, signatureHeader, secret)) valid = true;
  }
  return valid;
}

/** Secrets de webhook configurados (um por endpoint do Autentique), sem vazios nem repetidos. */
export function autentiqueWebhookSecretsFromEnv(env: Record<string, string | undefined>): string[] {
  const list = [env.AUTENTIQUE_WEBHOOK_SECRET_DOCUMENT, env.AUTENTIQUE_WEBHOOK_SECRET_SIGNATURE]
    .map((v) => v?.trim())
    .filter((v): v is string => !!v);
  return [...new Set(list)];
}

/** Tamanho mínimo do segredo de caminho (alta entropia); abaixo disso é erro de configuração. */
export const MIN_PATH_SECRET_LENGTH = 32;

/**
 * Segredo no caminho da URL do webhook (o Dashboard público do Autentique não expõe o secret HMAC).
 * Compara os SHA-256 dos dois valores em tempo constante (tamanhos iguais, sem vazar comprimento).
 */
export function pathSecretMatches(
  received: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!received || !expected || expected.length < MIN_PATH_SECRET_LENGTH) return false;
  const a = createHash("sha256").update(received, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export type AutentiqueEventType =
  | "document.created"
  | "document.updated"
  | "document.deleted"
  | "document.finished"
  | "signature.created"
  | "signature.updated"
  | "signature.deleted"
  | "signature.viewed"
  | "signature.accepted"
  | "signature.rejected"
  | "signature.delivery_failed"
  | (string & {});

export type ParsedAutentiqueEvent = {
  /** Id único do evento — chave de deduplicação (o mesmo evento pode chegar mais de uma vez). */
  eventId: string;
  type: AutentiqueEventType;
  createdAt: string | null;
  /** Id do documento a que o evento se refere, quando dá para extrair. */
  documentId: string | null;
  /** Id da assinatura (signatário), quando o evento é de assinatura. */
  signatureId: string | null;
};

/** Extrai só o necessário; payload inesperado devolve `null` (nunca lança, nunca confia em campos soltos). */
export function parseAutentiqueEvent(body: unknown): ParsedAutentiqueEvent | null {
  if (!body || typeof body !== "object") return null;
  const event = (body as { event?: unknown }).event;
  if (!event || typeof event !== "object") return null;
  const e = event as {
    id?: unknown;
    type?: unknown;
    created_at?: unknown;
    data?: { object?: { id?: unknown; document?: unknown; document_id?: unknown } } | null;
  };
  if (typeof e.id !== "string" || !e.id || typeof e.type !== "string" || !e.type) return null;
  const obj = e.data?.object;
  const isSignature = e.type.startsWith("signature.");
  const objId = typeof obj?.id === "string" ? obj.id : null;
  const docRef =
    typeof obj?.document === "string"
      ? obj.document
      : typeof (obj?.document as { id?: unknown } | undefined)?.id === "string"
        ? (obj?.document as { id: string }).id
        : typeof obj?.document_id === "string"
          ? obj.document_id
          : null;
  return {
    eventId: e.id,
    type: e.type,
    createdAt: typeof e.created_at === "string" ? e.created_at : null,
    documentId: isSignature ? docRef : objId,
    signatureId: isSignature ? objId : null,
  };
}

/** Evento → estado que ele SUGERE (a decisão final consulta o documento: eventos chegam fora de ordem). */
export function suggestedStateFromEvent(type: AutentiqueEventType): SignatureDocumentState | null {
  switch (type) {
    case "document.finished":
      return "assinado";
    case "document.deleted":
      return "cancelado";
    case "signature.rejected":
      return "recusado";
    case "signature.accepted":
      return "parcial";
    default:
      return null;
  }
}
