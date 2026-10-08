import { normalizeEmail } from "./autentique-status";
import { type ParsedAutentiqueEvent } from "./autentique-webhook";
import type {
  CreateSignatureDocumentInput,
  SignatureDocumentSnapshot,
  SignatureDocumentState,
  SignatureProvider,
  SignerRole,
  SignerSpec,
} from "./signature-provider";
import { SignatureProviderError } from "./signature-provider";

/**
 * Persistência do contrato de influenciador. Sem acesso direto ao banco: o chamador injeta um
 * `ContractRepo` (Supabase service-role em produção, memória nos testes). O ESTADO nunca é
 * decidido aqui nem pelo webhook: sai de `provider.getDocument` → `snapshotFromDocument`
 * (função central em autentique-status.ts), só sobre os signatários esperados.
 */

export type ContractRow = {
  id: string;
  participacaoId: string;
  provider: string;
  externalId: string | null;
  status: SignatureDocumentState;
  sentAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
};

export type SignerRow = {
  id: string;
  contratoId: string;
  papel: SignerRole;
  nome: string;
  email: string;
  emailNormalizado: string;
  externalId: string | null;
  status: "aguardando" | "assinado" | "recusado";
  viewedAt: string | null;
  signedAt: string | null;
  rejectedAt: string | null;
};

export type SignerPatch = Partial<
  Pick<SignerRow, "externalId" | "status" | "viewedAt" | "signedAt" | "rejectedAt">
>;
export type ContractPatch = Partial<
  Pick<
    ContractRow,
    "externalId" | "status" | "sentAt" | "completedAt" | "rejectedAt" | "cancelledAt"
  >
>;

export type EventInsert = {
  provider: string;
  eventId: string;
  tipo: string;
  contratoId: string | null;
  externalDocumentId: string | null;
  externalSignatureId: string | null;
  payload: Record<string, unknown>;
};

export interface ContractRepo {
  /** Lança `ActiveContractExistsError` se a participação já tem contrato vivo. */
  insertContract(participacaoId: string, provider: string): Promise<ContractRow>;
  insertSigners(
    contratoId: string,
    signers: Omit<SignerRow, "id" | "contratoId">[],
  ): Promise<SignerRow[]>;
  patchContract(id: string, patch: ContractPatch): Promise<void>;
  patchSigner(id: string, patch: SignerPatch): Promise<void>;
  findByExternalId(provider: string, externalId: string): Promise<ContractRow | null>;
  listSigners(contratoId: string): Promise<SignerRow[]>;
  /** Registra o evento; `duplicate` = já existia (UNIQUE provider+event_id) e `processed` diz se concluiu. */
  insertEvent(e: EventInsert): Promise<{ duplicate: boolean; processed: boolean }>;
  finishEvent(
    provider: string,
    eventId: string,
    r: { contratoId: string | null; erro: string | null },
  ): Promise<void>;
}

export class ActiveContractExistsError extends Error {
  constructor() {
    super("Esta participação já tem um contrato ativo.");
    this.name = "ActiveContractExistsError";
  }
}

/** Falha depois do provedor ter criado o documento: o `externalId` fica na mensagem p/ reconciliar. */
export class ContractPersistError extends Error {
  constructor(
    public readonly contratoId: string,
    public readonly externalId: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ContractPersistError";
  }
}

const AMBIGUOUS = new Set(["timeout", "unavailable"]);

export type CreateInfluencerContractInput = {
  participacaoId: string;
  file: CreateSignatureDocumentInput["file"];
  signers: SignerSpec[];
  sandbox?: boolean;
  message?: string;
  signaturePositions?: CreateSignatureDocumentInput["signaturePositions"];
};

export async function createInfluencerContract(
  deps: { repo: ContractRepo; provider: SignatureProvider; now?: () => Date },
  input: CreateInfluencerContractInput,
): Promise<{ contract: ContractRow; signers: SignerRow[] }> {
  const { repo, provider } = deps;
  const now = deps.now ?? (() => new Date());
  const roles = input.signers.map((s) => s.role);
  if (
    input.signers.length !== 2 ||
    !roles.includes("CONTRATADO") ||
    !roles.includes("CONTRATANTE")
  ) {
    throw new SignatureProviderError(
      "invalid_signer",
      "Esperados exatamente CONTRATADO e CONTRATANTE.",
    );
  }
  const emails = input.signers.map((s) => normalizeEmail(s.email));
  if (emails.some((e) => !e) || emails[0] === emails[1]) {
    throw new SignatureProviderError(
      "invalid_signer",
      "E-mails dos signatários inválidos ou repetidos.",
    );
  }

  // 1) a linha nasce ANTES da chamada externa: o índice único barra duplo envio e o id vai no
  //    nome do documento (VNH-<id>) para achar órfãos após um timeout ambíguo.
  const contract = await repo.insertContract(input.participacaoId, provider.name);

  let created;
  try {
    created = await provider.createAndSend({
      name: `VNH-${contract.id}`,
      file: input.file,
      signers: input.signers,
      sequential: false,
      sandbox: input.sandbox,
      message: input.message,
      signaturePositions: input.signaturePositions,
    });
  } catch (err) {
    const code = err instanceof SignatureProviderError ? err.code : null;
    if (code && AMBIGUOUS.has(code)) {
      // pode ter sido criado: NÃO cancela; fica pendente (sem external_id) p/ reconciliação manual
      throw err;
    }
    await repo.patchContract(contract.id, {
      status: "cancelado",
      cancelledAt: now().toISOString(),
    });
    throw err;
  }

  // 2) persiste id externo + signatários esperados (sem fingir atomicidade: 1 nova tentativa)
  const persist = async () => {
    const signerRows = await repo.insertSigners(
      contract.id,
      input.signers.map((s) => ({
        papel: s.role,
        nome: s.name,
        email: s.email.trim(),
        emailNormalizado: normalizeEmail(s.email),
        externalId: created.signers.find((p) => p.role === s.role)?.externalId ?? null,
        status: "aguardando" as const,
        viewedAt: null,
        signedAt: null,
        rejectedAt: null,
      })),
    );
    const sentAt = now().toISOString();
    await repo.patchContract(contract.id, { externalId: created.externalId, sentAt });
    return { signerRows, sentAt };
  };
  try {
    let r;
    try {
      r = await persist();
    } catch {
      r = await persist();
    }
    return {
      contract: { ...contract, externalId: created.externalId, sentAt: r.sentAt },
      signers: r.signerRows,
    };
  } catch {
    throw new ContractPersistError(
      contract.id,
      created.externalId,
      "Documento criado no provedor, mas a persistência falhou; reconciliar pelo id externo.",
    );
  }
}

/** Aplica um snapshot (já calculado sobre os esperados) às linhas persistidas. */
export async function applySnapshot(
  repo: ContractRepo,
  contract: ContractRow,
  signers: SignerRow[],
  snapshot: SignatureDocumentSnapshot,
  now: Date,
): Promise<ContractRow> {
  for (const row of signers) {
    const p = snapshot.signers.find((s) => normalizeEmail(s.email) === row.emailNormalizado);
    if (!p) continue;
    const status = p.rejected ? "recusado" : p.signed ? "assinado" : "aguardando";
    const patch: SignerPatch = {};
    if (!row.externalId && p.externalId) patch.externalId = p.externalId;
    if (status !== row.status) patch.status = status;
    if (p.viewed && !row.viewedAt) patch.viewedAt = now.toISOString();
    if (p.signed && !row.signedAt) patch.signedAt = p.signedAt ?? now.toISOString();
    if (p.rejected && !row.rejectedAt) patch.rejectedAt = now.toISOString();
    if (Object.keys(patch).length) await repo.patchSigner(row.id, patch);
  }
  // cancelado localmente é terminal; o resto segue o provedor (verdade), então fora de ordem converge
  if (contract.status === "cancelado") return contract;
  const patch: ContractPatch = {};
  if (snapshot.state !== contract.status) patch.status = snapshot.state;
  if (snapshot.state === "assinado" && !contract.completedAt) patch.completedAt = now.toISOString();
  if (snapshot.state === "recusado" && !contract.rejectedAt) patch.rejectedAt = now.toISOString();
  if (snapshot.state === "cancelado" && !contract.cancelledAt)
    patch.cancelledAt = now.toISOString();
  if (!Object.keys(patch).length) return contract;
  await repo.patchContract(contract.id, patch);
  return { ...contract, ...patch };
}

/** Reconcilia um contrato com o provedor (também serve para reparar órfãos/eventos perdidos). */
export async function reconcileContract(
  deps: { repo: ContractRepo; provider: SignatureProvider; now?: () => Date },
  contract: ContractRow,
): Promise<ContractRow> {
  if (!contract.externalId) return contract;
  const signers = await deps.repo.listSigners(contract.id);
  const snapshot = await deps.provider.getDocument(
    contract.externalId,
    signers.map((s) => s.emailNormalizado),
  );
  return applySnapshot(deps.repo, contract, signers, snapshot, (deps.now ?? (() => new Date()))());
}

const RELEVANT = new Set(["document.finished", "signature.accepted", "signature.rejected"]);

export type EventOutcome =
  | "duplicate"
  | "ignored_type"
  | "unknown_contract"
  | "technical_signature"
  | "reconciled";

/**
 * Processa um evento já autenticado (HMAC) e parseado. Idempotente: o mesmo `eventId` não é
 * reprocessado se já concluiu; se falhou antes, a nova entrega (retry do provedor) reprocessa.
 * Lança em falha transitória (provedor/banco) para o endpoint responder 5xx e o Autentique tentar de novo.
 */
export async function processAutentiqueEvent(
  deps: { repo: ContractRepo; provider: SignatureProvider; now?: () => Date },
  event: ParsedAutentiqueEvent,
): Promise<EventOutcome> {
  const { repo, provider } = deps;
  const name = provider.name;
  const found = event.documentId ? await repo.findByExternalId(name, event.documentId) : null;
  const ins = await repo.insertEvent({
    provider: name,
    eventId: event.eventId,
    tipo: event.type,
    contratoId: found?.id ?? null,
    externalDocumentId: event.documentId,
    externalSignatureId: event.signatureId,
    payload: { type: event.type, created_at: event.createdAt },
  });
  if (ins.duplicate && ins.processed) return "duplicate";

  const finish = (erro: string | null) =>
    repo.finishEvent(name, event.eventId, { contratoId: found?.id ?? null, erro });

  try {
    if (!RELEVANT.has(event.type)) {
      await finish(null);
      return "ignored_type";
    }
    if (!found) {
      await finish("contrato_nao_encontrado");
      return "unknown_contract";
    }
    if (event.signatureId) {
      const signers = await repo.listSigners(found.id);
      const known = signers.some((s) => s.externalId === event.signatureId);
      const hasGap = signers.some((s) => !s.externalId);
      // assinatura que não é de nenhum esperado: só registro técnico, sem papel nem estado
      if (!known && !hasGap) {
        await finish(null);
        return "technical_signature";
      }
    }
    await reconcileContract(deps, found);
    await finish(null);
    return "reconciled";
  } catch (err) {
    await finish(err instanceof Error ? err.name : "erro").catch(() => undefined);
    throw err;
  }
}
