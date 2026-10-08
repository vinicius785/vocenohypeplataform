/**
 * Teste CONTROLADO do Autentique em SANDBOX (nenhum contrato real, nenhum crédito consumido).
 *
 *   AUTENTIQUE_API_TOKEN=... \
 *   AUTENTIQUE_SMOKE_CONTRATADO_EMAIL=voce+influ@seudominio.com \
 *   AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL=voce+agencia@seudominio.com \
 *   bun scripts/autentique-sandbox-smoke.ts [--keep]
 *
 * Valida: criar documento → cadastrar signatários → enviar → ids → status → (apagar). Imprime
 * apenas ids e estados — nunca o token. Sem `--keep`, apaga o documento de teste no final.
 */
import { AutentiqueProvider } from "../src/lib/signature/autentique.server";
import { buildMinimalPdf } from "../src/lib/signature/minimal-pdf";
import { SignatureProviderError } from "../src/lib/signature/signature-provider";

const token = process.env.AUTENTIQUE_API_TOKEN?.trim();
const influEmail = process.env.AUTENTIQUE_SMOKE_CONTRATADO_EMAIL?.trim();
const agencyEmail = process.env.AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL?.trim();
const keep = process.argv.includes("--keep");

if (!token || !influEmail || !agencyEmail) {
  console.error(
    "Defina AUTENTIQUE_API_TOKEN, AUTENTIQUE_SMOKE_CONTRATADO_EMAIL e AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL.",
  );
  process.exit(1);
}

const provider = new AutentiqueProvider(token);
const step = (n: number, label: string) => console.log(`\n[${n}] ${label}`);

try {
  step(1, "Criar documento FICTÍCIO em sandbox + signatários + envio");
  const created = await provider.createAndSend({
    name: `VNH-TESTE-${Date.now()}`,
    sandbox: true,
    sequential: true,
    file: {
      bytes: buildMinimalPdf([
        "CONTRATO FICTICIO - TESTE DE INTEGRACAO",
        "Sem valor juridico. Dados ficticios.",
        "CONTRATADO(A): Pessoa Teste",
        "CONTRATANTE: Agencia Teste",
      ]),
      fileName: "contrato-teste.pdf",
      mimeType: "application/pdf",
    },
    signers: [
      { role: "CONTRATADO", name: "Pessoa Teste", email: influEmail },
      { role: "CONTRATANTE", name: "Agencia Teste", email: agencyEmail },
    ],
  });
  console.log("documento:", created.externalId);
  for (const s of created.signers)
    console.log(" signatário:", s.role, s.externalId, s.link ? "(link)" : "");

  step(2, "Consultar status");
  const snap = await provider.getDocument(created.externalId);
  console.log("estado:", snap.state);
  for (const s of snap.signers)
    console.log(" ", s.externalId, { viewed: s.viewed, signed: s.signed, rejected: s.rejected });

  if (keep) {
    console.log("\n--keep: documento mantido (sandbox expira sozinho em alguns dias).");
  } else {
    step(3, "Apagar o documento de teste");
    await provider.cancelDocument(created.externalId);
    console.log("apagado.");
  }
  console.log("\nOK");
} catch (err) {
  if (err instanceof SignatureProviderError) {
    console.error(
      `FALHOU [${err.code}]${err.retryable ? " (pode tentar de novo)" : ""}: ${err.message}`,
    );
  } else {
    console.error("FALHOU: erro inesperado.");
  }
  process.exit(1);
}
