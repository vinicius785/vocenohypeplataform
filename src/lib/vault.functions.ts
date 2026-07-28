import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns the vault's master encryption key — admin-only, no passphrase
 * involved. The key lives in `vault_secret`, a table with RLS enabled and no
 * grants to authenticated/anon, so the only way to ever read it is through
 * this server function's service-role client, gated by an `is_admin` check.
 */
export const getVaultKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    if (!isAdmin) throw new Error("Apenas administradores podem acessar o cofre.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error: dbError } = await supabaseAdmin
      .from("vault_secret")
      .select("key_b64")
      .eq("id", true)
      .maybeSingle();
    if (dbError || !data) throw new Error(dbError?.message ?? "Cofre não inicializado.");
    return { keyB64: data.key_b64 };
  });
