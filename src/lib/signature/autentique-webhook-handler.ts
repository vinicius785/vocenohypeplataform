import { parseAutentiqueEvent, verifyAutentiqueSignature } from "./autentique-webhook";
import { processAutentiqueEvent, type ContractRepo } from "./influencer-contract-service";
import type { SignatureProvider } from "./signature-provider";

export type WebhookResult = { status: number; body: string | { ok: true; outcome: string } };

/**
 * Lógica do endpoint, sem I/O de framework: segredo → HMAC sobre o corpo CRU → parse →
 * processamento idempotente. 5xx em falha transitória faz o Autentique reenviar.
 * `getDeps` só é chamado depois da assinatura válida (nada de banco/provedor para requisição forjada).
 */
export async function handleAutentiqueWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string | undefined;
  getDeps: () => Promise<{ repo: ContractRepo; provider: SignatureProvider }>;
}): Promise<WebhookResult> {
  if (!input.secret) return { status: 500, body: "Webhook not configured" };
  if (!verifyAutentiqueSignature(input.rawBody, input.signatureHeader, input.secret))
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
