/**
 * Piece D of the 2026-09-18 security pass (see CLAUDE.md): admin-only,
 * per-client, explicit-click token deactivation for the legacy
 * `/portal.$token` public link. NEVER wired to run automatically or in
 * bulk — see the migration plan's own note that this must happen "somente
 * depois da validação" per client, a human decision.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/team.functions";
import { z } from "zod";

const DeactivateInput = z.object({ clienteId: z.string().uuid() });

/** Sets `clientes.data.publicToken` to `null` for exactly one client,
 * disabling that client's old `/portal.$token` link (a fresh token can
 * still be generated later the normal way, in `ClientesSection.tsx`'s
 * `copyClientLink`, if ever needed again). Uses `supabaseAdmin` because the
 * `data` JSONB column write pattern here mirrors the other admin-mediated
 * `clientes` mutations in `organization-invites.functions.ts`. */
export const deactivateClientToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => DeactivateInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("clientes")
      .select("id, data, organization_id")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("Cliente não encontrado.");

    const clienteData = (row.data ?? {}) as Record<string, unknown>;
    const hadToken = typeof clienteData.publicToken === "string" && clienteData.publicToken;
    if (!hadToken) {
      // Nothing to do — already deactivated (or never had a token). Not an
      // error: the UI only shows the button when a token is set, but this
      // guards against a stale UI / double-click race.
      return { ok: true, alreadyInactive: true };
    }

    const nextData = { ...clienteData, publicToken: null };
    const { error: updateErr } = await supabaseAdmin
      .from("clientes")
      .update({ data: nextData as never })
      .eq("id", data.clienteId);
    if (updateErr) throw new Error(updateErr.message);

    const { error: auditErr } = await supabaseAdmin.from("access_audit_log").insert({
      actor_user_id: context.userId,
      organization_id: row.organization_id ?? null,
      action: "token_deactivated",
      target_user_id: null,
      previous_value: { clienteId: data.clienteId, publicToken: hadToken } as never,
      new_value: { clienteId: data.clienteId, publicToken: null } as never,
    });
    if (auditErr) {
      console.error("[clientes.functions] falha ao registrar auditoria de token", auditErr.message);
    }

    return { ok: true, alreadyInactive: false };
  });
