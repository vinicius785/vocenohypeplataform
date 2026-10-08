import {
  MIN_PATH_SECRET_LENGTH,
  parseAutentiqueEvent,
  pathSecretMatches,
  verifyAutentiqueSignatureAny,
} from "./autentique-webhook";
import { processAutentiqueEvent, type ContractRepo } from "./influencer-contract-service";
import type { SignatureProvider } from "./signature-provider";

export type WebhookResult = { status: number; body: string | { ok: true; outcome: string } };

/**
 * Lógica do endpoint, sem I/O de framework. Ordem: método POST → segredo do CAMINHO (autenticação
 * obrigatória; o Dashboard público do Autentique não entrega secret HMAC) → HMAC sobre o corpo CRU,
 * só se houver secrets HMAC configurados (camada extra) → parse → processamento idempotente.
 * O processamento nunca confia no payload para definir estado: reconcilia com o Autentique.
 * 5xx em falha transitória faz o Autentique reenviar. `getDeps` só roda após a autenticação.
 */
export async function handleAutentiqueWebhook(input: {
  method: string;
  /** Segredo recebido no caminho da URL. */
  pathSecret: string | undefined;
  /** AUTENTIQUE_WEBHOOK_PATH_SECRET; ausente ou curto = erro de configuração. */
  expectedPathSecret: string | undefined;
  rawBody: string;
  signatureHeader: string | null;
  /** Secrets HMAC opcionais dos endpoints do Autentique; vazio = não exigir HMAC. */
  secrets: readonly string[];
  getDeps: () => Promise<{ repo: ContractRepo; provider: SignatureProvider }>;
}): Promise<WebhookResult> {
  if (input.method.toUpperCase() !== "POST") return { status: 405, body: "Method not allowed" };
  if (!input.expectedPathSecret || input.expectedPathSecret.length < MIN_PATH_SECRET_LENGTH)
    return { status: 500, body: "Webhook not configured" };
  if (!pathSecretMatches(input.pathSecret, input.expectedPathSecret))
    return { status: 404, body: "Not found" };
  if (
    input.secrets.length > 0 &&
    !verifyAutentiqueSignatureAny(input.rawBody, input.signatureHeader, input.secrets)
  )
    return { status: 401, body: "Unauthorized" };

  let json: unknown;
  try {
    json = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: "Invalid JSON" };
  }
  const event = parseAutentiqueEvent(json);
  if (!event) return { status: 400, body: "Invalid event" };

  try {
    const outcome = await processAutentiqueEvent(await input.getDeps(), event);
    return { status: 200, body: { ok: true, outcome } };
  } catch {
    return { status: 500, body: "Processing failed" };
  }
}
