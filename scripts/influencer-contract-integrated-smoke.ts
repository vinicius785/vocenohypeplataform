/**
 * Smoke INTEGRADO (Fase 3.3): createInfluencerContract → Supabase real → Autentique SANDBOX →
 * external_id → reconciliação (2x) → proteção contra duplicidade → limpeza. Sem documento real.
 *
 *   SMOKE_PARTICIPACAO_ID=<uuid de campanha_influenciadores> \
 *   bun scripts/influencer-contract-integrated-smoke.ts --sandbox
 *
 * Exige SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AUTENTIQUE_API_TOKEN, SMOKE_PARTICIPACAO_ID e
 * `--sandbox` (sem a flag: falha imediata). Toda criação passa por um provider-guarda que aborta
 * antes da rede se `sandbox !== true`. A participação é só referenciada; nada dela é alterado.
 * Não imprime token, headers, payloads, links nem e-mails completos.
 * Cenário de credencial inválida: UMA chamada ao Autentique com um token fictício embutido
 * (não cria documento; o esperado é 401).
 */
import { AutentiqueProvider, type ErrorDiagnostic } from "../src/lib/signature/autentique.server";
import { buildMinimalPdf } from "../src/lib/signature/minimal-pdf";
import { createSupabaseContractRepo } from "../src/lib/signature/influencer-contract-repo.server";
import {
  ActiveContractExistsError,
  createInfluencerContract,
  reconcileContract,
  type CreateInfluencerContractInput,
} from "../src/lib/signature/influencer-contract-service";
import {
  SignatureProviderError,
  type CreateSignatureDocumentInput,
  type SignatureProvider,
} from "../src/lib/signature/signature-provider";

let failures = 0;
const ok = (label: string, cond: boolean) => {
  console.log(`${cond ? "OK  " : "FALHA"} ${label}`);
  if (!cond) failures++;
};
const abort = (msg: string): never => {
  console.error(`FALHA IMEDIATA: ${msg}`);
  process.exit(1);
};
const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const token = process.env.AUTENTIQUE_API_TOKEN?.trim();
const participacaoId = process.env.SMOKE_PARTICIPACAO_ID?.trim();
if (!process.argv.includes("--sandbox")) abort("sandbox não habilitado: passe --sandbox");
if (!process.env.SUPABASE_URL?.trim()) abort("SUPABASE_URL ausente");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) abort("SUPABASE_SERVICE_ROLE_KEY ausente");
if (!token) abort("AUTENTIQUE_API_TOKEN ausente");
if (!participacaoId) abort("SMOKE_PARTICIPACAO_ID ausente");

const emailA =
  process.env.AUTENTIQUE_SMOKE_CONTRATADO_EMAIL?.trim() || "smoke-contratado@example.invalid";
const emailB =
  process.env.AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL?.trim() || "smoke-contratante@example.invalid";

let lastDiagnostic: ErrorDiagnostic | null = null;
let createCalls = 0;
const guard = (real: SignatureProvider): SignatureProvider => ({
  name: real.name,
  async createAndSend(input: CreateSignatureDocumentInput) {
    if (input.sandbox !== true) throw new Error("guarda: createAndSend sem sandbox:true");
    createCalls++;
    return real.createAndSend(input);
  },
  getDocument: (id, emails) => real.getDocument(id, emails),
  cancelDocument: (id) => real.cancelDocument(id),
});
const provider = guard(
  new AutentiqueProvider(token!, fetch, undefined, undefined, (d) => (lastDiagnostic = d)),
);
const badProvider = guard(new AutentiqueProvider("token-ficticio-invalido-smoke"));

function describeError(e: unknown, etapa: string): string {
  if (e instanceof SignatureProviderError)
    return `etapa=${etapa} code=${e.code} retryable=${e.retryable} — ${e.message}`;
  return `etapa=${etapa} ${e instanceof Error ? e.name : "erro desconhecido"}`;
}

const mkInput = (id: string, tag: string): CreateInfluencerContractInput => ({
  participacaoId: id,
  sandbox: true,
  file: {
    bytes: buildMinimalPdf([`CONTRATO FICTICIO - SMOKE ${tag}`, "Sem valor juridico."]),
    fileName: "smoke.pdf",
    mimeType: "application/pdf",
  },
  signers: [
    { role: "CONTRATADO", name: "Pessoa Teste", email: emailA },
    { role: "CONTRATANTE", name: "Agencia Teste", email: emailB },
  ],
});

async function main() {
  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const repo = createSupabaseContractRepo(db);
  const startedAt = new Date().toISOString();
  let step = "fixture";

  /** Remove SÓ o que esta execução criou (participação + created_at >= início). Idempotente. */
  async function cleanup(label: string) {
    const mine = await db
      .from("contratos_influenciador")
      .select("id, external_id")
      .eq("participacao_id", participacaoId)
      .gte("created_at", startedAt);
    const rows: { id: string; external_id: string | null }[] = mine.data ?? [];
    if (!rows.length) return console.log(`(${label}) nada a limpar`);
    let docsRemoved = true;
    for (const r of rows) {
      if (r.external_id) {
        try {
          await provider.cancelDocument(r.external_id);
          try {
            await provider.getDocument(r.external_id, [emailA]);
            docsRemoved = false;
          } catch (e) {
            docsRemoved =
              docsRemoved && e instanceof SignatureProviderError && e.code === "not_found";
          }
        } catch {
          docsRemoved = false;
          console.log(
            `AVISO: limpar manualmente no Autentique o documento sandbox ${r.external_id}`,
          );
        }
      } else {
        console.log(`(${label}) contrato ${r.id} sem external_id; nenhum documento a apagar`);
      }
      await db.from("contratos_influenciador_eventos").delete().eq("contrato_id", r.id);
      await db.from("contratos_influenciador").delete().eq("id", r.id);
    }
    const ids = rows.map((r) => r.id);
    const [c1, c2, c3] = await Promise.all([
      db.from("contratos_influenciador").select("id").in("id", ids),
      db.from("contratos_influenciador_signatarios").select("id").in("contrato_id", ids),
      db.from("contratos_influenciador_eventos").select("id").in("contrato_id", ids),
    ]);
    if (rows.some((r) => r.external_id)) ok(`(${label}) documento Sandbox removido`, docsRemoved);
    ok(`(${label}) contrato local removido`, (c1.data ?? []).length === 0);
    ok(
      `(${label}) signatários/eventos removidos`,
      (c2.data ?? []).length + (c3.data ?? []).length === 0,
    );
  }

  try {
    console.log("[1] Fixture");
    const part = await db
      .from("campanha_influenciadores")
      .select("id")
      .eq("id", participacaoId)
      .maybeSingle();
    if (part.error || !part.data) abort("participação não encontrada; nada foi criado");
    const live = await db
      .from("contratos_influenciador")
      .select("id")
      .eq("participacao_id", participacaoId)
      .in("status", ["aguardando", "parcial", "assinado"]);
    if ((live.data ?? []).length) abort("a participação já tem contrato ativo; nada foi alterado");
    ok(`participação encontrada e sem contrato ativo: ${participacaoId}`, true);

    console.log("[2] Cenários de erro seguros");
    step = "participação inválida";
    let before = createCalls;
    const inval = await createInfluencerContract(
      { repo, provider },
      mkInput("00000000-0000-4000-8000-000000000000", "A"),
    ).then(
      () => false,
      () => true,
    );
    const leak = await db
      .from("contratos_influenciador")
      .select("id")
      .eq("participacao_id", "00000000-0000-4000-8000-000000000000");
    ok(
      "A) participação inválida: erro antes do Autentique, sem linha",
      inval && createCalls === before && (leak.data ?? []).length === 0,
    );

    step = "credencial inválida";
    before = createCalls;
    const badErr = await createInfluencerContract(
      { repo, provider: badProvider },
      mkInput(participacaoId!, "C"),
    ).catch((e) => e);
    const row = (
      await db
        .from("contratos_influenciador")
        .select("status, external_id")
        .eq("participacao_id", participacaoId)
        .gte("created_at", startedAt)
    ).data?.[0];
    ok(
      "C) credencial inválida: unauthorized, contrato cancelado e sem external_id",
      badErr instanceof SignatureProviderError &&
        badErr.code === "unauthorized" &&
        row?.status === "cancelado" &&
        !row?.external_id,
    );
    await cleanup("cenário C");

    console.log("[3] Criação integrada");
    step = "criação";
    const { contract } = await createInfluencerContract(
      { repo, provider },
      mkInput(participacaoId!, "OK"),
    );
    ok(`contrato local: ${contract.id}`, !!contract.id);
    ok(`documento Autentique Sandbox: ${contract.externalId ?? "AUSENTE"}`, !!contract.externalId);

    step = "persistência";
    console.log("[4] Persistência");
    const back = (await db.from("contratos_influenciador").select().eq("id", contract.id).single())
      .data;
    ok(
      "participacao_id, provider, external_id, sent_at",
      back?.participacao_id === participacaoId &&
        back?.provider === "autentique" &&
        back?.external_id === contract.externalId &&
        !!back?.sent_at,
    );
    ok("status aguardando", back?.status === "aguardando");
    const rows = await repo.listSigners(contract.id);
    const por = (p: string) => rows.filter((r) => r.papel === p);
    ok(
      "exatamente 1 CONTRATADO e 1 CONTRATANTE",
      rows.length === 2 && por("CONTRATADO").length === 1 && por("CONTRATANTE").length === 1,
    );
    const a = por("CONTRATADO")[0];
    const b = por("CONTRATANTE")[0];
    ok(
      `e-mails corretos e normalizados (${mask(emailA)}, ${mask(emailB)})`,
      a?.email === emailA &&
        b?.email === emailB &&
        a?.emailNormalizado === emailA.toLowerCase() &&
        b?.emailNormalizado === emailB.toLowerCase(),
    );
    ok(
      "status inicial dos signatários aguardando",
      rows.every((r) => r.status === "aguardando"),
    );
    console.log(`    external_id dos signatários: ${rows.filter((r) => r.externalId).length}/2`);

    console.log("[5] Reconciliação");
    step = "reconciliação";
    const snap = await provider.getDocument(
      contract.externalId!,
      rows.map((r) => r.emailNormalizado),
    );
    console.log(`    assinaturas não esperadas ignoradas: ${snap.unmatchedSignatures.length}`);
    const snapshotOf = async () => ({
      c: (await db.from("contratos_influenciador").select().eq("id", contract.id).single()).data,
      s: (
        await db.from("contratos_influenciador_signatarios").select().eq("contrato_id", contract.id)
      ).data as { id: string; status: string; updated_at: string }[],
      e: (
        (
          await db
            .from("contratos_influenciador_eventos")
            .select("id")
            .eq("contrato_id", contract.id)
        ).data ?? []
      ).length,
    });
    const r1 = await reconcileContract({ repo, provider }, contract);
    const s1 = await snapshotOf();
    ok(
      "primeira reconciliação mantém aguardando; signatários pendentes",
      r1.status === "aguardando" &&
        s1.s.every((x) => x.status === "aguardando") &&
        s1.s.length === 2,
    );
    await sleep(60);
    const r2 = await reconcileContract({ repo, provider }, contract);
    const s2 = await snapshotOf();
    ok(
      "segunda reconciliação idempotente (sem duplicar, timestamps intactos)",
      r2.status === "aguardando" &&
        s2.s.length === 2 &&
        s2.e === 0 &&
        s1.c.updated_at === s2.c.updated_at &&
        s1.s.every((x) => s2.s.find((y) => y.id === x.id)?.updated_at === x.updated_at),
    );

    console.log("[6] Proteção contra duplicidade");
    step = "duplicidade";
    before = createCalls;
    const dup = await createInfluencerContract(
      { repo, provider },
      mkInput(participacaoId!, "DUP"),
    ).catch((e) => e);
    const total = (
      (
        await db
          .from("contratos_influenciador")
          .select("id")
          .eq("participacao_id", participacaoId)
          .gte("created_at", startedAt)
      ).data ?? []
    ).length;
    ok(
      "B) segundo contrato bloqueado (ActiveContractExistsError, sem 2º documento)",
      dup instanceof ActiveContractExistsError && createCalls === before && total === 1,
    );
  } catch (e) {
    ok(`fluxo ${describeError(e, step)}`, false);
    if (
      e instanceof SignatureProviderError &&
      (e.code === "unauthorized" || e.code === "rejected_by_provider")
    ) {
      const d = lastDiagnostic as ErrorDiagnostic | null;
      console.log("DIAGNÓSTICO DO PROVIDER");
      console.log(`http_status=${d?.httpStatus ?? "indisponível"}`);
      console.log(`message=${d?.messages.join(" | ") || "indisponível"}`);
    }
  } finally {
    console.log("[7] Limpeza");
    await cleanup("final");
  }
  console.log(failures ? `\nRESULTADO: ${failures} falha(s)` : "\nRESULTADO: OK");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(`erro: ${e instanceof Error ? e.name : "desconhecido"}`);
  process.exit(1);
});
