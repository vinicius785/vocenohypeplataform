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

/**
 * `clientes.organization_id` (added NOT NULL by
 * `20260918160000_client_organizations_phase1.sql`) is the client's OWN
 * portal organization — a dedicated `organizations` row of type `'client'`,
 * one per `clientes` row (see `is_internal_team_member`/`user_can_access_campanha`
 * and the whole `client-access.functions.ts`/`organization-invites.functions.ts`
 * multi-tenancy model) — NOT the internal agency org the logged-in user
 * belongs to. Every path that creates a brand-new `clientes` row must also
 * create this organization first; `createTableArrayStore`'s generic
 * upsert (`clientesStore.set`, used by `ClientesSection.tsx` and
 * `convertLead.ts`) never sends `organization_id` at all, which is exactly
 * why a first-time client creation always failed with the NOT NULL
 * violation this function fixes.
 */
const CreateClienteInput = z.object({
  id: z.string().uuid(),
  empresa: z.string().trim().min(1, "Nome da empresa é obrigatório."),
  cliente: z.record(z.unknown()),
});

export const createClienteComOrganizacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateClienteInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cria a organização dedicada do cliente via service-role: usuários
    // comuns não têm (nem devem ter) permissão de INSERT direto em
    // `organizations` (policy "organizations admin write" é admin-only) —
    // essa organização nasce sempre como consequência de criar um cliente,
    // nunca como ação independente do usuário.
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .insert({ name: data.empresa, type: "client", status: "active" })
      .select("id")
      .single();
    if (orgErr || !org) {
      throw new Error(orgErr?.message ?? "Falha ao criar organização do cliente.");
    }

    // Insere o cliente pelo client RLS-scoped (`context.supabase`), não
    // `supabaseAdmin`: é a policy "clientes/campanhas insert clientes"
    // (`has_permission('clientes') OR has_permission('campanhas')`) quem
    // decide se ESTE usuário pode criar um cliente — reaproveita a mesma
    // checagem que já protegia o INSERT direto anterior, em vez de
    // duplicá-la aqui. Falhando (sem permissão, sessão expirada, etc.),
    // desfaz a organização recém-criada pra não deixar registro órfão.
    const { error: clienteErr } = await context.supabase.from("clientes").insert({
      id: data.id,
      organization_id: org.id,
      data: data.cliente as never,
    });
    if (clienteErr) {
      await supabaseAdmin.from("organizations").delete().eq("id", org.id);
      throw new Error(clienteErr.message);
    }

    return { ok: true, organizationId: org.id as string };
  });

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
