/**
 * Observação do FLUXO de assinatura no Autentique, em SANDBOX (nada de contrato real).
 * Só OBSERVA e imprime o que a API devolve — não altera nosso domínio nem o provedor.
 *
 *   # 1) cria um documento de teste (mantido) e mostra os ids; --show-links imprime os links de
 *   #    assinatura (se a API os devolver) para você abrir no navegador
 *   bun scripts/autentique-sandbox-flow.ts create [--show-links]
 *
 *   # 2) acompanha o documento: imprime uma linha SÓ quando algo muda (estado derivado + flags)
 *   bun scripts/autentique-sandbox-flow.ts watch <documentId> [--raw] [--every=15]
 *
 *   # 3) apaga o documento de teste
 *   bun scripts/autentique-sandbox-flow.ts delete <documentId>
 *
 * Variáveis: AUTENTIQUE_API_TOKEN, AUTENTIQUE_SMOKE_CONTRATADO_EMAIL, AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL.
 * O token nunca é impresso; e-mails/links saem mascarados (exceto links com --show-links).
 */
import { AutentiqueProvider } from "../src/lib/signature/autentique.server";
import { buildMinimalPdf } from "../src/lib/signature/minimal-pdf";
import { SignatureProviderError } from "../src/lib/signature/signature-provider";

const [, , cmd, arg, ...rest] = process.argv;
const flags = [arg, ...rest].filter((x): x is string => !!x && x.startsWith("--"));
const showLinks = flags.includes("--show-links");
const raw = flags.includes("--raw");
const every = Math.max(
  10,
  Number(flags.find((f) => f.startsWith("--every="))?.split("=")[1] ?? 15),
);

const token = process.env.AUTENTIQUE_API_TOKEN?.trim();
if (!token) {
  console.error("Defina AUTENTIQUE_API_TOKEN.");
  process.exit(1);
}

const maskEmail = (e: string | null | undefined) =>
  e ? e.replace(/^(.).*(@.*)$/, "$1***$2") : null;
function mask(key: string, value: unknown) {
  if (typeof value !== "string") return value;
  if (key === "email") return maskEmail(value);
  if (key === "phone" || key === "ip" || key === "port") return "***";
  if (key === "short_link" || key === "link") return showLinks ? value : "***";
  return value;
}

const provider = new AutentiqueProvider(token, fetch, undefined, (_op, data) => {
  if (raw) console.log("\n[resposta crua, mascarada]\n" + JSON.stringify(data, mask, 2));
});

const stamp = () => new Date().toISOString().slice(11, 19);

async function create() {
  const influ = process.env.AUTENTIQUE_SMOKE_CONTRATADO_EMAIL?.trim();
  const agency = process.env.AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL?.trim();
  if (!influ || !agency) {
    console.error("Defina AUTENTIQUE_SMOKE_CONTRATADO_EMAIL e AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL.");
    process.exit(1);
  }
  const created = await provider.createAndSend({
    name: `VNH-TESTE-FLUXO-${Date.now()}`,
    sandbox: true,
    sequential: true,
    file: {
      bytes: buildMinimalPdf(["CONTRATO FICTICIO - FLUXO DE ASSINATURA", "Sem valor juridico."]),
      fileName: "contrato-teste.pdf",
      mimeType: "application/pdf",
    },
    signers: [
      { role: "CONTRATADO", name: "Pessoa Teste", email: influ },
      { role: "CONTRATANTE", name: "Agencia Teste", email: agency },
    ],
  });
  console.log("documento:", created.externalId);
  for (const s of created.signers) {
    console.log(" assinatura:", {
      papel: s.role ?? "(nenhum dos nossos)",
      id: s.externalId,
      nome: s.name,
      email: maskEmail(s.email),
      acao: s.action,
      temConta: s.hasAccount,
      ...(showLinks && s.link
        ? { link: s.link }
        : { link: s.link ? "sim (use --show-links)" : "não" }),
    });
  }
}

async function watch(id: string) {
  const expected = [
    process.env.AUTENTIQUE_SMOKE_CONTRATADO_EMAIL?.trim(),
    process.env.AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL?.trim(),
  ].filter((e): e is string => !!e);
  if (expected.length === 0) {
    console.error(
      "Defina AUTENTIQUE_SMOKE_CONTRATADO_EMAIL e AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL (o estado só considera esses e-mails).",
    );
    process.exit(1);
  }
  console.log(`Acompanhando ${id} a cada ${every}s. Ctrl+C para parar.`);
  let last = "";
  for (;;) {
    try {
      const snap = await provider.getDocument(id, expected);
      const fmt = (s: {
        externalId: string;
        viewed: boolean;
        signed: boolean;
        rejected: boolean;
      }) => `${s.externalId.slice(0, 8) || "(ausente)"}:${+s.viewed}${+s.signed}${+s.rejected}`;
      const sig = `${snap.signers.map(fmt).join(" ")} | fora: ${snap.unmatchedSignatures.map(fmt).join(" ") || "-"}`;
      const line = `${snap.state} | ${sig} | arquivoAssinado=${snap.signedFileUrl ? "sim" : "não"}`;
      if (line !== last) {
        last = line;
        console.log(`[${stamp()}] estado=${snap.state}`);
        const show = (tag: string, s: (typeof snap.signers)[number]) =>
          console.log(
            `   ${tag} ${s.externalId || "(ausente)"} email=${maskEmail(s.email)} viewed=${s.viewed} signed=${s.signed} rejected=${s.rejected}${s.signedAt ? ` signedAt=${s.signedAt}` : ""}`,
          );
        for (const s of snap.signers) show("esperado:", s);
        for (const s of snap.unmatchedSignatures) show("fora dos esperados (ignorada):", s);
        console.log(`   arquivo assinado disponível: ${snap.signedFileUrl ? "sim" : "não"}`);
      }
    } catch (err) {
      if (err instanceof SignatureProviderError) {
        console.log(`[${stamp()}] ERRO [${err.code}]${err.retryable ? " (tentando de novo)" : ""}`);
        if (!err.retryable) process.exit(1);
      } else throw err;
    }
    await new Promise((r) => setTimeout(r, every * 1000));
  }
}

try {
  if (cmd === "create") await create();
  else if (cmd === "watch" && arg && !arg.startsWith("--")) await watch(arg);
  else if (cmd === "delete" && arg && !arg.startsWith("--")) {
    await provider.cancelDocument(arg);
    console.log("apagado.");
  } else {
    console.error("Uso: create [--show-links] | watch <id> [--raw] [--every=15] | delete <id>");
    process.exit(1);
  }
} catch (err) {
  console.error(
    err instanceof SignatureProviderError
      ? `FALHOU [${err.code}]: ${err.message}`
      : "FALHOU: erro inesperado.",
  );
  process.exit(1);
}
