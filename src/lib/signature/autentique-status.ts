import type {
  SignatureDocumentSnapshot,
  SignatureDocumentState,
  SignerProgress,
} from "./signature-provider";

/**
 * O Autentique NÃO expõe um "status do documento": o estado sai dos eventos de cada assinatura.
 * E o documento pode trazer assinaturas que NÃO são dos signatários que enviamos (observado em
 * sandbox: uma terceira assinatura de outro e-mail, que nunca assina). Por isso o estado
 * contratual é calculado SÓ sobre os signatários ESPERADOS (casados por e-mail normalizado).
 *
 * Regras (sobre os esperados):
 *  - qualquer recusa → recusado (vence tudo, menos cancelado);
 *  - todos assinaram → assinado;
 *  - ao menos um assinou e falta algum → parcial;
 *  - senão → aguardando.
 * `viewed` e `files.signed` NUNCA entram na decisão.
 */
export function deriveDocumentState(
  expected: Pick<SignerProgress, "signed" | "rejected">[],
  opts: { deleted?: boolean } = {},
): SignatureDocumentState {
  if (opts.deleted) return "cancelado";
  if (expected.some((s) => s.rejected)) return "recusado";
  if (expected.length > 0 && expected.every((s) => s.signed)) return "assinado";
  if (expected.some((s) => s.signed)) return "parcial";
  return "aguardando";
}

export const normalizeEmail = (e: string | null | undefined): string =>
  (e ?? "").trim().toLowerCase();

type RawSignature = {
  public_id: string;
  email?: string | null;
  viewed?: { created_at?: string } | null;
  signed?: { created_at?: string } | null;
  rejected?: { created_at?: string } | null;
};

const toProgress = (s: RawSignature): SignerProgress => ({
  externalId: s.public_id,
  email: s.email ?? null,
  viewed: !!s.viewed,
  signed: !!s.signed,
  rejected: !!s.rejected,
  signedAt: s.signed?.created_at ?? null,
});

/**
 * Resposta crua de `document(id)` → snapshot normalizado.
 * `expectedEmails` = os e-mails que enviamos no `createDocument`. Assinaturas de outros e-mails vão
 * para `unmatchedSignatures` (só diagnóstico) e NÃO influenciam o estado. Um esperado que não
 * aparece na resposta conta como pendente.
 */
export function snapshotFromDocument(
  doc: {
    id: string;
    deleted_at?: string | null;
    files?: { signed?: string | null } | null;
    signatures?: RawSignature[] | null;
  },
  expectedEmails: readonly string[],
): SignatureDocumentSnapshot {
  const raw = doc.signatures ?? [];
  const wanted = [...new Set(expectedEmails.map(normalizeEmail).filter(Boolean))];

  const signers: SignerProgress[] = wanted.map((email) => {
    const matches = raw.filter((s) => normalizeEmail(s.email) === email).map(toProgress);
    if (matches.length === 0) {
      return {
        externalId: "",
        email,
        viewed: false,
        signed: false,
        rejected: false,
        signedAt: null,
      };
    }
    return {
      externalId: matches[0].externalId,
      email: matches[0].email,
      viewed: matches.some((m) => m.viewed),
      signed: matches.some((m) => m.signed),
      rejected: matches.some((m) => m.rejected),
      signedAt: matches.find((m) => m.signedAt)?.signedAt ?? null,
    };
  });

  const unmatchedSignatures = raw
    .filter((s) => !wanted.includes(normalizeEmail(s.email)))
    .map(toProgress);

  return {
    externalId: doc.id,
    state: deriveDocumentState(signers, { deleted: !!doc.deleted_at }),
    signers,
    unmatchedSignatures,
    signedFileUrl: doc.files?.signed ?? null,
  };
}
