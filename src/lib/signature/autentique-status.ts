import type {
  SignatureDocumentSnapshot,
  SignatureDocumentState,
  SignerProgress,
} from "./signature-provider";

/**
 * O Autentique NÃO expõe um "status do documento": o estado sai dos eventos de cada assinatura
 * (`viewed`, `signed`, `rejected`...). Esta função pura faz essa derivação. Regras:
 *  - qualquer recusa → recusado (vence tudo, menos cancelado);
 *  - todos assinaram → assinado;
 *  - alguém assinou → parcial;
 *  - senão → aguardando.
 */
export function deriveDocumentState(
  signers: Pick<SignerProgress, "signed" | "rejected">[],
  opts: { deleted?: boolean } = {},
): SignatureDocumentState {
  if (opts.deleted) return "cancelado";
  if (signers.some((s) => s.rejected)) return "recusado";
  if (signers.length > 0 && signers.every((s) => s.signed)) return "assinado";
  if (signers.some((s) => s.signed)) return "parcial";
  return "aguardando";
}

/** Resposta crua de `document(id)` → snapshot normalizado. Defensivo: campos ausentes viram `false`/`null`. */
export function snapshotFromDocument(doc: {
  id: string;
  deleted_at?: string | null;
  files?: { signed?: string | null } | null;
  signatures?: Array<{
    public_id: string;
    email?: string | null;
    viewed?: { created_at?: string } | null;
    signed?: { created_at?: string } | null;
    rejected?: { created_at?: string } | null;
  }> | null;
}): SignatureDocumentSnapshot {
  const signers: SignerProgress[] = (doc.signatures ?? []).map((s) => ({
    externalId: s.public_id,
    email: s.email ?? null,
    viewed: !!s.viewed,
    signed: !!s.signed,
    rejected: !!s.rejected,
    signedAt: s.signed?.created_at ?? null,
  }));
  return {
    externalId: doc.id,
    state: deriveDocumentState(signers, { deleted: !!doc.deleted_at }),
    signers,
    signedFileUrl: doc.files?.signed ?? null,
  };
}
