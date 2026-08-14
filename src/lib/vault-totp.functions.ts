import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
export const GRANT_TTL_MS = 10 * 60 * 1000;

async function assertAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("is_admin", {
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Apenas administradores podem configurar o autenticador.");
}

/** O código TOTP em si já é um segredo (só admins o têm), mas checar SÓ o
 * código deixava a permissão "Senhas"/"Configurações" — que esconde a aba
 * na UI — sem nenhuma validação correspondente no servidor: um usuário
 * autenticado sem essa permissão, que de algum jeito visse/capturasse um
 * código válido de um admin (compartilhamento de tela, foto, engenharia
 * social), conseguia chamar esta function direto e receber a chave mestra
 * do cofre mesmo assim. Exige a mesma permissão que já guarda a aba. */
async function assertCanRequestVaultAccess(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin", {
    _user_id: context.userId,
  });
  if (adminError) throw new Error(adminError.message);
  if (isAdmin) return;
  const { data: profile, error: profileError } = await context.supabase
    .from("profiles")
    .select("permissions")
    .eq("id", context.userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  const perms = (profile?.permissions as string[] | null) ?? [];
  const allowed =
    Array.isArray(perms) &&
    (perms.includes("configuracoes") ||
      perms.includes("senhas") ||
      perms.includes("configuracoes:senhas"));
  if (!allowed) {
    throw new Error("Você não tem permissão para acessar o cofre de senhas.");
  }
}

/** Admin-only: whether the current admin already has a TOTP secret registered. */
export const getVaultTotpStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("vault_totp_secrets")
      .select("created_at")
      .eq("admin_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { enrolled: Boolean(data), createdAt: data?.created_at ?? null };
  });

/** Admin-only: generates (or replaces) this admin's TOTP secret, returned once for enrollment. */
export const enrollVaultTotp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { generateTotpSecret } = await import("./totp.server");
    const secret = generateTotpSecret();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("vault_totp_secrets")
      .upsert({ admin_id: context.userId, secret, created_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { secret };
  });

/**
 * Anyone authenticated: verifies a 6-digit code against every admin's TOTP
 * secret and, on a match, hands back the vault's master key directly — this
 * replaces the old ECDH request/grant flow, since the server itself already
 * has service-role access to `vault_secret` (same as `getVaultKey`).
 */
export const verifyVaultTotpAndUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { code: string }) => data)
  .handler(async ({ context, data }) => {
    await assertCanRequestVaultAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyTotpCode } = await import("./totp.server");

    const { data: attempt } = await supabaseAdmin
      .from("vault_totp_attempts")
      .select("failed_count, locked_until")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) {
      throw new Error("Muitas tentativas. Tente novamente em alguns minutos.");
    }

    const { data: secrets, error: secretsError } = await supabaseAdmin
      .from("vault_totp_secrets")
      .select("secret");
    if (secretsError) throw new Error(secretsError.message);

    const matched = (secrets ?? []).some((row) => verifyTotpCode(row.secret, data.code));

    if (!matched) {
      const nextCount = (attempt?.failed_count ?? 0) + 1;
      const lockedUntil =
        nextCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
      await supabaseAdmin.from("vault_totp_attempts").upsert({
        user_id: context.userId,
        failed_count: lockedUntil ? 0 : nextCount,
        locked_until: lockedUntil,
      });
      throw new Error(
        lockedUntil ? "Muitas tentativas. Tente novamente em alguns minutos." : "Código inválido.",
      );
    }

    await supabaseAdmin
      .from("vault_totp_attempts")
      .upsert({ user_id: context.userId, failed_count: 0, locked_until: null });

    const { data: vaultRow, error: vaultError } = await supabaseAdmin
      .from("vault_secret")
      .select("key_b64")
      .eq("id", true)
      .maybeSingle();
    if (vaultError || !vaultRow) throw new Error(vaultError?.message ?? "Cofre não inicializado.");

    return { keyB64: vaultRow.key_b64, expiresAt: Date.now() + GRANT_TTL_MS };
  });
