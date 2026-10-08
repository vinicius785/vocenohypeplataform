import {
  ActiveContractExistsError,
  type ContractPatch,
  type ContractRepo,
  type ContractRow,
  type SignerPatch,
  type SignerRow,
} from "./influencer-contract-service";

/** Cliente mínimo (service-role). As tabelas novas ainda não estão nos tipos gerados. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

const T = "contratos_influenciador";
const TS = "contratos_influenciador_signatarios";
const TE = "contratos_influenciador_eventos";

/* eslint-disable @typescript-eslint/no-explicit-any */
const toContract = (r: any): ContractRow => ({
  id: r.id,
  participacaoId: r.participacao_id,
  provider: r.provider,
  externalId: r.external_id,
  status: r.status,
  sentAt: r.sent_at,
  completedAt: r.completed_at,
  rejectedAt: r.rejected_at,
  cancelledAt: r.cancelled_at,
});
const toSigner = (r: any): SignerRow => ({
  id: r.id,
  contratoId: r.contrato_id,
  papel: r.papel,
  nome: r.nome,
  email: r.email,
  emailNormalizado: r.email_normalizado,
  externalId: r.external_id,
  status: r.status,
  viewedAt: r.viewed_at,
  signedAt: r.signed_at,
  rejectedAt: r.rejected_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const snake = (o: Record<string, unknown>) => {
  const map: Record<string, string> = {
    externalId: "external_id",
    sentAt: "sent_at",
    completedAt: "completed_at",
    rejectedAt: "rejected_at",
    cancelledAt: "cancelled_at",
    viewedAt: "viewed_at",
    signedAt: "signed_at",
  };
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [map[k] ?? k, v]));
};

function check(error: { message?: string; code?: string } | null) {
  // nunca repassa error.message cru adiante (regra do projeto: throwSafeDbError)
  if (error) throw new Error(`db_error:${error.code ?? "unknown"}`);
}

export function createSupabaseContractRepo(db: Db): ContractRepo {
  return {
    async insertContract(participacaoId, provider) {
      const { data, error } = await db
        .from(T)
        .insert({ participacao_id: participacaoId, provider })
        .select()
        .single();
      if (error?.code === "23505") throw new ActiveContractExistsError();
      check(error);
      return toContract(data);
    },
    async insertSigners(contratoId, signers) {
      const { data, error } = await db
        .from(TS)
        .insert(
          signers.map((s) => ({
            contrato_id: contratoId,
            papel: s.papel,
            nome: s.nome,
            email: s.email,
            email_normalizado: s.emailNormalizado,
            external_id: s.externalId,
            status: s.status,
          })),
        )
        .select();
      check(error);
      return (data ?? []).map(toSigner);
    },
    async patchContract(id: string, patch: ContractPatch) {
      const { error } = await db.from(T).update(snake(patch)).eq("id", id);
      check(error);
    },
    async patchSigner(id: string, patch: SignerPatch) {
      const { error } = await db.from(TS).update(snake(patch)).eq("id", id);
      check(error);
    },
    async findByExternalId(provider, externalId) {
      const { data, error } = await db
        .from(T)
        .select()
        .eq("provider", provider)
        .eq("external_id", externalId)
        .maybeSingle();
      check(error);
      return data ? toContract(data) : null;
    },
    async listSigners(contratoId) {
      const { data, error } = await db.from(TS).select().eq("contrato_id", contratoId);
      check(error);
      return (data ?? []).map(toSigner);
    },
    async insertEvent(e) {
      const { error } = await db.from(TE).insert({
        contrato_id: e.contratoId,
        provider: e.provider,
        event_id: e.eventId,
        tipo: e.tipo,
        external_document_id: e.externalDocumentId,
        external_signature_id: e.externalSignatureId,
        payload: e.payload,
      });
      if (!error) return { duplicate: false, processed: false };
      if (error.code !== "23505") check(error);
      const { data, error: e2 } = await db
        .from(TE)
        .select("processado_at")
        .eq("provider", e.provider)
        .eq("event_id", e.eventId)
        .maybeSingle();
      check(e2);
      return { duplicate: true, processed: !!data?.processado_at };
    },
    async finishEvent(provider, eventId, r) {
      const { error } = await db
        .from(TE)
        .update({
          contrato_id: r.contratoId,
          erro: r.erro,
          // erro transitório deixa processado_at nulo: o retry do provedor reprocessa
          processado_at:
            r.erro && r.erro !== "contrato_nao_encontrado" ? null : new Date().toISOString(),
        })
        .eq("provider", provider)
        .eq("event_id", eventId);
      check(error);
    },
  };
}
