/**
 * Fecha uma lacuna funcional real encontrada durante a reformulação da tela
 * de login (2026-09-18): `inviteClientUser` cria o vínculo com
 * `status: "invited"`, mas nada nunca o move pra `"active"` —
 * `resolveUserEnvironment` só conta vínculos ativos, então um cliente recém
 * convidado nunca era reconhecido como tendo um ambiente de cliente (caía em
 * "acesso pendente" mesmo autenticando certo com a senha temporária).
 *
 * A prova de aceite do convite, neste modelo (sem link/token de convite
 * separado — o próprio acesso já é a credencial), é justamente conseguir
 * autenticar com sucesso pela primeira vez. `acceptPendingInvites` ativa
 * (idempotente) todo vínculo `invited` do usuário autenticado — chamado uma
 * vez, logo após confirmar a sessão, antes de `resolveUserEnvironment` no
 * guard do portal (`portal-app/route.tsx`). Usa `supabaseAdmin` (nenhuma
 * política de RLS nova necessária — a checagem de "é o próprio usuário
 * autenticado" já vem do `requireSupabaseAuth`, não de uma policy).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const acceptPendingInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAuditLog } = await import("@/lib/audit-log.functions");

    const { data: invited, error } = await supabaseAdmin
      .from("organization_members")
      .select("id, organization_id")
      .eq("user_id", context.userId)
      .eq("status", "invited");
    if (error) throw new Error(error.message);
    if (!invited || invited.length === 0) return { activated: 0 };

    const now = new Date().toISOString();
    for (const row of invited) {
      const { error: updateErr } = await supabaseAdmin
        .from("organization_members")
        .update({ status: "active", accepted_at: now, updated_at: now })
        .eq("id", row.id)
        .eq("status", "invited"); // re-checa pra nunca reativar algo já suspenso/removido nesse meio-tempo
      if (updateErr) throw new Error(updateErr.message);

      await writeAuditLog(supabaseAdmin, {
        actorUserId: context.userId,
        organizationId: row.organization_id,
        action: "invite_accepted",
        previousValue: { status: "invited" },
        newValue: { status: "active" },
      });
    }

    return { activated: invited.length };
  });
