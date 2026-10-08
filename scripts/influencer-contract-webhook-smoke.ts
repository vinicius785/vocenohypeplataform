/**
 * Prepara o teste REAL do webhook: cria UM contrato em SANDBOX e o MANTÉM (sem limpeza).
 *
 *   SMOKE_PARTICIPACAO_ID=<uuid de campanha_influenciadores> \
 *   bun scripts/influencer-contract-webhook-smoke.ts --sandbox
 *
 * Exige SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AUTENTIQUE_API_TOKEN, SMOKE_PARTICIPACAO_ID e
 * `--sandbox`. Reutiliza `createInfluencerContract` (nada de lógica duplicada). Bloqueia se a
 * participação já tem contrato ativo. NÃO apaga o documento nem as linhas ao final: a assinatura é
 * feita por você nos e-mails e o webhook atualiza o banco. Não imprime token, chaves, secret nem links.
 */
import { AutentiqueProvider } from "../src/lib/signature/autentique.server";
import { buildMinimalPdf } from "../src/lib/signature/minimal-pdf";
import { createSupabaseContractRepo } from "../src/lib/signature/influencer-contract-repo.server";
import {
  ActiveContractExistsError,
  createInfluencerContract,
} from "../src/lib/signature/influencer-contract-service";
import {
  SignatureProviderError,
  type CreateSignatureDocumentInput,
  type SignatureProvider,
} from "../src/lib/signature/signature-provider";

const abort = (msg: string): never => {
  console.error(`ABORTADO: ${msg}`);
  process.exit(1);
};
const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

const token = process.env.AUTENTIQUE_API_TOKEN?.trim();
const participacaoId = process.env.SMOKE_PARTICIPACAO_ID?.trim();
if (!process.argv.includes("--sandbox")) abort("sandbox não habilitado: passe --sandbox");
if (!process.env.SUPABASE_URL?.trim()) abort("SUPABASE_URL ausente");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) abort("SUPABASE_SERVICE_ROLE_KEY ausente");
if (!token) abort("AUTENTIQUE_API_TOKEN ausente");
if (!participacaoId) abort("SMOKE_PARTICIPACAO_ID ausente");

const emailA = process.env.AUTENTIQUE_SMOKE_CONTRATADO_EMAIL?.trim();
const emailB = process.env.AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL?.trim();
if (!emailA || !emailB)
  abort(
    "defina AUTENTIQUE_SMOKE_CONTRATADO_EMAIL e AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL (e-mails reais seus)",
  );

// guarda: nada vai à rede sem sandbox:true
const real = new AutentiqueProvider(token!);
const provider: SignatureProvider = {
  name: real.name,
  async createAndSend(input: CreateSignatureDocumentInput) {
    if (input.sandbox !== true) throw new Error("guarda: createAndSend sem sandbox:true");
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
  if ((live.data ?? []).length) abort("a participação já tem contrato ativo; nada foi criado");

  const { contract, signers } = await createInfluencerContract(
    { repo, provider },
    {
      participacaoId: participacaoId!,
      sandbox: true,
      file: {
        bytes: buildMinimalPdf(["CONTRATO FICTICIO - TESTE DE WEBHOOK", "Sem valor juridico."]),
        fileName: "webhook-smoke.pdf",
        mimeType: "application/pdf",
      },
      signers: [
        { role: "CONTRATADO", name: "Pessoa Teste", email: emailA! },
        { role: "CONTRATANTE", name: "Agencia Teste", email: emailB! },
      ],
    },
  );

  console.log(`participação: ${participacaoId}`);
  console.log(`contrato local: ${contract.id}`);
  console.log(`documento externo: ${contract.externalId}`);
  console.log(`status local: ${contract.status}`);
  for (const s of signers)
    console.log(
      `- ${s.papel}: ${mask(s.email)} (normalizado: ${s.emailNormalizado === s.email.trim().toLowerCase() ? "ok" : "divergente"}; id de assinatura: ${s.externalId ? "presente" : "ausente"})`,
    );
  console.log("\nDocumento MANTIDO (sem limpeza). Assine pelos e-mails e acompanhe o webhook.");
}

main().catch((e) => {
  if (e instanceof ActiveContractExistsError) abort("a participação já tem contrato ativo");
  if (e instanceof SignatureProviderError)
    abort(`etapa=criação code=${e.code} retryable=${e.retryable} — ${e.message}`);
  abort(`erro: ${e instanceof Error ? e.name : "desconhecido"}`);
});
