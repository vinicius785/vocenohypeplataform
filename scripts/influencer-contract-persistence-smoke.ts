/**
 * Smoke REAL de persistência do contrato de influenciador (Supabase real, service role).
 * NÃO chama o Autentique, NÃO cria documento externo, NÃO testa webhook.
 *
 *   bun scripts/influencer-contract-persistence-smoke.ts
 *
 * Usa uma participação existente de `campanha_influenciadores` (só lê o id), cria UM contrato de
 * teste + 2 signatários pela camada de repositório, valida constraints/trigger/FK e remove SOMENTE
 * as linhas que criou (por id exato). Imprime só ids, status, contagens e papéis — nunca e-mails,
 * chaves ou links. Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e, opcionalmente,
 * AUTENTIQUE_SMOKE_CONTRATADO_EMAIL / AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL.
 */
import { randomUUID } from "node:crypto";
import { normalizeEmail } from "../src/lib/signature/autentique-status";
import { createSupabaseContractRepo } from "../src/lib/signature/influencer-contract-repo.server";
import { ActiveContractExistsError } from "../src/lib/signature/influencer-contract-service";

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "OK  " : "FALHA"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const repo = createSupabaseContractRepo(db);

  // 1) participação existente, sem contrato vivo (só lê o id)
  const { data: parts, error: pe } = await db
    .from("campanha_influenciadores")
    .select("id")
    .limit(50);
  if (pe) throw new Error(`leitura de participações falhou (${pe.code})`);
  const { data: live } = await db
    .from("contratos_influenciador")
    .select("participacao_id")
    .in("status", ["aguardando", "parcial", "assinado"]);
  const busy = new Set((live ?? []).map((r: { participacao_id: string }) => r.participacao_id));
  const participacaoId: string | undefined = (parts ?? [])
    .map((p: { id: string }) => p.id)
    .find((id: string) => !busy.has(id));
  if (!participacaoId) throw new Error("nenhuma participação livre encontrada; nada foi criado");
  console.log(`participação usada: ${participacaoId}`);

  const emailA =
    process.env.AUTENTIQUE_SMOKE_CONTRATADO_EMAIL?.trim() || "smoke-contratado@example.invalid";
  const emailB =
    process.env.AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL?.trim() || "smoke-contratante@example.invalid";

  let contratoId: string | null = null;
  try {
    // 2) cria contrato + signatários pela camada de persistência
    const c = await repo.insertContract(participacaoId, "autentique");
    contratoId = c.id;
    console.log(`contrato criado: ${c.id}`);
    ok("status inicial aguardando", c.status === "aguardando");
    ok("provider autentique", c.provider === "autentique");
    ok("external_id nulo", c.externalId === null);
    ok("sent_at nulo", c.sentAt === null);

    const mk = (papel: "CONTRATADO" | "CONTRATANTE", nome: string, email: string) => ({
      papel,
      nome,
      email,
      emailNormalizado: normalizeEmail(email),
      externalId: null,
      status: "aguardando" as const,
      viewedAt: null,
      signedAt: null,
      rejectedAt: null,
    });
    await repo.insertSigners(c.id, [
      mk("CONTRATADO", "Smoke Contratado", emailA),
      mk("CONTRATANTE", "Smoke Contratante", emailB),
    ]);

    // 3) relê do banco
    const { data: back } = await db
      .from("contratos_influenciador")
      .select()
      .eq("id", c.id)
      .single();
    const signers = await repo.listSigners(c.id);
    console.log(`status: ${back?.status}; participação: ${back?.participacao_id}`);
    console.log(
      `signatários: ${signers.length} (${signers
        .map((s) => s.papel)
        .sort()
        .join(", ")})`,
    );
    ok("contrato relido ligado à participação", back?.participacao_id === participacaoId);
    ok("2 signatários", signers.length === 2);
    ok(
      "papéis CONTRATADO e CONTRATANTE",
      signers
        .map((s) => s.papel)
        .sort()
        .join() === "CONTRATADO,CONTRATANTE",
    );
    ok(
      "e-mails normalizados",
      signers.every((s) => s.emailNormalizado === normalizeEmail(s.email)),
    );

    // 4) constraints
    const dupPapel = await db.from("contratos_influenciador_signatarios").insert({
      contrato_id: c.id,
      papel: "CONTRATADO",
      nome: "x",
      email: "outro@example.invalid",
      email_normalizado: "outro@example.invalid",
    });
    ok("unique (contrato_id, papel)", dupPapel.error?.code === "23505");
    const dupEmail = await db.from("contratos_influenciador_signatarios").insert({
      contrato_id: c.id,
      papel: "CONTRATANTE",
      nome: "x",
      email: emailA,
      email_normalizado: normalizeEmail(emailA),
    });
    ok("unique (contrato_id, email_normalizado)", dupEmail.error?.code === "23505");
    try {
      await repo.insertContract(participacaoId, "autentique");
      ok("um contrato ativo por participação", false);
    } catch (e) {
      ok("um contrato ativo por participação", e instanceof ActiveContractExistsError);
    }
    const badFk = await db
      .from("contratos_influenciador")
      .insert({ participacao_id: randomUUID() });
    ok("FK para campanha_influenciadores", badFk.error?.code === "23503");

    // 5) trigger de updated_at
    const before = new Date(back.updated_at).getTime();
    await sleep(50);
    await repo.patchContract(c.id, { rejectedAt: null, externalId: null });
    const { data: after } = await db
      .from("contratos_influenciador")
      .select("updated_at")
      .eq("id", c.id)
      .single();
    ok("trigger updated_at", new Date(after.updated_at).getTime() > before);
    const sBefore = new Date(
      (
        await db
          .from("contratos_influenciador_signatarios")
          .select("updated_at")
          .eq("id", signers[0].id)
          .single()
      ).data.updated_at,
    ).getTime();
    await sleep(50);
    await repo.patchSigner(signers[0].id, { viewedAt: null });
    const sAfter = new Date(
      (
        await db
          .from("contratos_influenciador_signatarios")
          .select("updated_at")
          .eq("id", signers[0].id)
          .single()
      ).data.updated_at,
    ).getTime();
    ok("trigger updated_at (signatário)", sAfter > sBefore);
  } finally {
    // 6) limpeza: SÓ o contrato criado aqui (por id exato); signatários caem em cascata
    if (contratoId) {
      await db.from("contratos_influenciador").delete().eq("id", contratoId);
      const c1 = await db.from("contratos_influenciador").select("id").eq("id", contratoId);
      const c2 = await db
        .from("contratos_influenciador_signatarios")
        .select("id")
        .eq("contrato_id", contratoId);
      const clean = (c1.data ?? []).length === 0 && (c2.data ?? []).length === 0;
      ok("limpeza (contrato e signatários removidos)", clean);
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
  console.error(`erro: ${e instanceof Error ? e.message : "desconhecido"}`);
  process.exit(1);
});
