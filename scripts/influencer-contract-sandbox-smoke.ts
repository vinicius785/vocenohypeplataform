/**
 * Smoke de INTEGRAÇÃO: createInfluencerContract → Supabase real → Autentique SANDBOX →
 * external_id → reconciliação → limpeza. Nenhum contrato real, nenhum dado real de influenciador.
 *
 *   SMOKE_PARTICIPACAO_ID=<uuid de campanha_influenciadores> \
 *   bun scripts/influencer-contract-sandbox-smoke.ts --sandbox
 *
 * Exige: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AUTENTIQUE_API_TOKEN, SMOKE_PARTICIPACAO_ID e a
 * flag `--sandbox`. A participação é só REFERENCIADA (FK); nada dela é lido além do id nem alterado.
 * Sandbox é garantido por um provider-guarda: qualquer createAndSend sem `sandbox: true` aborta
 * ANTES de ir à rede. Imprime só ids, estados e contagens (nunca chaves, e-mails ou links).
 * Limpeza em `finally`: apaga o documento sandbox (se há external_id) e as linhas criadas aqui.
 */
import { AutentiqueProvider, type ErrorDiagnostic } from "../src/lib/signature/autentique.server";
import { buildMinimalPdf } from "../src/lib/signature/minimal-pdf";
import { createSupabaseContractRepo } from "../src/lib/signature/influencer-contract-repo.server";
import {
  ActiveContractExistsError,
  createInfluencerContract,
  reconcileContract,
} from "../src/lib/signature/influencer-contract-service";
import type {
  CreateSignatureDocumentInput,
  SignatureProvider,
} from "../src/lib/signature/signature-provider";
import { SignatureProviderError } from "../src/lib/signature/signature-provider";

let failures = 0;
let step = "criação";
let lastError: unknown = null;

/** Diagnóstico seguro: só etapa, código, retryable e a mensagem já sanitizada do erro. */
function describeError(e: unknown, etapa: string): string {
  if (e instanceof SignatureProviderError)
    return `etapa=${etapa} code=${e.code} retryable=${e.retryable} — ${e.message}`;
  return `etapa=${etapa} ${e instanceof Error ? e.name : "erro desconhecido"}`;
}

/** Aviso de limpeza coerente com o erro real (sem sugerir timeout quando o erro é conhecido). */
function orphanNote(id: string): string {
  if (lastError instanceof SignatureProviderError) {
    if (lastError.code === "timeout" || lastError.code === "unavailable")
      return `contrato ${id} sem external_id; por segurança, procure o documento VNH-${id} no sandbox`;
    return `contrato ${id} sem external_id; o documento não foi identificado como criado (erro definitivo)`;
  }
  return `contrato ${id} sem external_id; causa não identificada, sem inferência sobre o documento`;
}
const ok = (label: string, cond: boolean) => {
  console.log(`${cond ? "OK  " : "FALHA"} ${label}`);
  if (!cond) failures++;
};
const abort = (msg: string): never => {
  console.error(`ABORTADO: ${msg}`);
  process.exit(1);
};
const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const token = process.env.AUTENTIQUE_API_TOKEN?.trim();
const participacaoId = process.env.SMOKE_PARTICIPACAO_ID?.trim();
if (!url) abort("SUPABASE_URL ausente");
if (!serviceKey) abort("SUPABASE_SERVICE_ROLE_KEY ausente");
if (!token) abort("AUTENTIQUE_API_TOKEN ausente");
if (!participacaoId)
  abort("SMOKE_PARTICIPACAO_ID ausente (uuid existente de campanha_influenciadores)");
if (!process.argv.includes("--sandbox")) abort("sandbox não habilitado: passe --sandbox");

const emailA =
  process.env.AUTENTIQUE_SMOKE_CONTRATADO_EMAIL?.trim() || "smoke-contratado@example.invalid";
const emailB =
  process.env.AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL?.trim() || "smoke-contratante@example.invalid";

/** Guarda: nada vai à rede sem `sandbox: true`. Conta chamadas para provar a idempotência. */
let createCalls = 0;
let lastDiagnostic: ErrorDiagnostic | null = null;
const real = new AutentiqueProvider(token!, fetch, undefined, undefined, (d) => {
  lastDiagnostic = d;
});

/** Só para unauthorized / rejected_by_provider: o que o Autentique respondeu (já sanitizado). */
function printProviderDiagnostic(e: unknown) {
  if (!(e instanceof SignatureProviderError)) return;
  if (e.code !== "unauthorized" && e.code !== "rejected_by_provider") return;
  const d = lastDiagnostic as ErrorDiagnostic | null;
  console.log("DIAGNÓSTICO DO PROVIDER");
  if (!d) return void console.log("(nenhuma resposta de erro capturada)");
  console.log(`http_status=${d.httpStatus ?? "indisponível"}`);
  console.log(`graphql_code=${d.graphqlCodes.join(",") || "indisponível"}`);
  console.log(`message=${d.messages.join(" | ") || "indisponível"}`);
  console.log(`response_keys=${d.responseKeys.join(",") || "indisponível"}`);
}
const provider: SignatureProvider = {
  name: real.name,
  async createAndSend(input: CreateSignatureDocumentInput) {
    if (input.sandbox !== true) throw new Error("guarda: createAndSend sem sandbox:true");
    createCalls++;
    return real.createAndSend(input);
  },
  getDocument: (id, emails) => real.getDocument(id, emails),
  cancelDocument: (id) => real.cancelDocument(id),
};

async function main() {
  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const repo = createSupabaseContractRepo(db);
  const startedAt = new Date().toISOString();
  console.log(`participação/fixture: ${participacaoId}\nsandbox: true`);

  const part = await db
    .from("campanha_influenciadores")
    .select("id")
    .eq("id", participacaoId)
    .maybeSingle();
  if (part.error || !part.data) abort("participação não encontrada");
  const live = await db
    .from("contratos_influenciador")
    .select("id")
    .eq("participacao_id", participacaoId)
    .in("status", ["aguardando", "parcial", "assinado"]);
  if ((live.data ?? []).length) abort("a participação já tem contrato ativo; nada foi criado");
  ok("A) nenhum contrato ativo antes", true);

  try {
    const { contract, signers } = await createInfluencerContract(
      { repo, provider },
      {
        participacaoId: participacaoId!,
        sandbox: true,
        file: {
          bytes: buildMinimalPdf([
            "CONTRATO FICTICIO - SMOKE",
            "Sem valor juridico. Dados ficticios.",
          ]),
          fileName: "smoke.pdf",
          mimeType: "application/pdf",
        },
        signers: [
          { role: "CONTRATADO", name: "Pessoa Teste", email: emailA },
          { role: "CONTRATANTE", name: "Agencia Teste", email: emailB },
        ],
      },
    );
    console.log(`contrato criado: ${contract.id}\nprovider: ${contract.provider}`);
    console.log(
      `external_id: ${contract.externalId ? "presente" : "AUSENTE"}\nstatus: ${contract.status}\nsignatários: ${signers.length}`,
    );
    for (const s of signers)
      console.log(`- ${s.papel}: ${s.externalId ? "presente" : "sem id"} (${mask(s.email)})`);

    ok(
      "persistência inicial (provider autentique, aguardando)",
      contract.provider === "autentique" && contract.status === "aguardando",
    );
    ok("external_id", !!contract.externalId);
    ok("sent_at preenchido", !!contract.sentAt);
    ok(
      "signatários CONTRATADO e CONTRATANTE",
      signers
        .map((s) => s.papel)
        .sort()
        .join() === "CONTRATADO,CONTRATANTE",
    );

    // C) consulta direta ao documento sandbox (só os dois e-mails esperados decidem)
    step = "consulta";
    const snap = await provider.getDocument(
      contract.externalId!,
      signers.map((s) => s.emailNormalizado),
    );
    ok("C) documento consultável no Autentique", snap.externalId === contract.externalId);
    ok("C) estado derivado aguardando (viewed/files/extra ignorados)", snap.state === "aguardando");

    // D) reconciliação + E) releitura
    step = "reconciliação";
    const rec = await reconcileContract({ repo, provider }, contract);
    ok("D) reconciliação mantém aguardando", rec.status === "aguardando");
    const back = await db.from("contratos_influenciador").select().eq("id", contract.id).single();
    const sig = await repo.listSigners(contract.id);
    ok(
      "E) releitura consistente",
      back.data?.external_id === contract.externalId &&
        back.data?.status === "aguardando" &&
        sig.length === 2,
    );

    // duplicidade: o banco barra ANTES de qualquer chamada ao provider
    step = "duplicidade";
    const before = createCalls;
    let dup = false;
    try {
      await createInfluencerContract(
        { repo, provider },
        {
          participacaoId: participacaoId!,
          sandbox: true,
          file: {
            bytes: buildMinimalPdf(["DUP"]),
            fileName: "dup.pdf",
            mimeType: "application/pdf",
          },
          signers: [
            { role: "CONTRATADO", name: "Pessoa Teste", email: emailA },
            { role: "CONTRATANTE", name: "Agencia Teste", email: emailB },
          ],
        },
      );
    } catch (e) {
      dup = e instanceof ActiveContractExistsError;
    }
    ok("proteção contra duplicidade (sem 2ª chamada ao provider)", dup && createCalls === before);
  } catch (e) {
    lastError = e;
    printProviderDiagnostic(e);
    ok(`fluxo principal ${describeError(e, step)}`, false);
  } finally {
    // limpeza: só linhas desta execução (participação + created_at >= início)
    const mine = await db
      .from("contratos_influenciador")
      .select("id, external_id")
      .eq("participacao_id", participacaoId)
      .gte("created_at", startedAt);
    const rows: { id: string; external_id: string | null }[] = mine.data ?? [];
    for (const r of rows) {
      if (r.external_id) {
        try {
          await provider.cancelDocument(r.external_id);
        } catch {
          console.log(
            `AVISO: não consegui apagar o documento sandbox do contrato ${r.id} (expira sozinho)`,
          );
        }
      } else {
        console.log(`AVISO: ${orphanNote(r.id)}`);
      }
      await db.from("contratos_influenciador_eventos").delete().eq("contrato_id", r.id);
      await db.from("contratos_influenciador").delete().eq("id", r.id);
    }
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      const c1 = await db.from("contratos_influenciador").select("id").in("id", ids);
      const c2 = await db
        .from("contratos_influenciador_signatarios")
        .select("id")
        .in("contrato_id", ids);
      const c3 = await db
        .from("contratos_influenciador_eventos")
        .select("id")
        .in("contrato_id", ids);
      ok(
        "limpeza completa",
        [c1, c2, c3].every((c) => (c.data ?? []).length === 0),
      );
    } else {
      console.log("nada criado; nada a limpar");
    }
  }
  console.log(
    failures ? `\n${failures} verificação(ões) falharam` : "\nTodas as verificações passaram",
  );
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(`erro: ${e instanceof Error ? e.name : "desconhecido"}`);
  process.exit(1);
});
