import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCanManageDemo } from "@/lib/demo/demo-permission";

/**
 * Funções de servidor da Demo para o TIME (docs/decisions/0004-demo-operacional.md).
 * Todas exigem a permissão `comercial` (admins passam: `has_permission` já os inclui),
 * checada no servidor. A regra de negócio mora em `lib/demo/demo-service.ts`; aqui só há
 * autorização, validação de entrada e a ligação com o banco.
 *
 * O token do link só sai por `getDemoLink`. As demais devolvem a visão SEM token.
 * (As funções públicas do cliente, por token, são da Etapa 4.)
 */

const SessionInput = z.object({ sessionId: z.string().uuid() });

async function demoService() {
  const { getServerDemoService } = await import("@/lib/demo/demo-service.server");
  return getServerDemoService();
}

/** Cria a demonstração de um lead (campanha isolada + dados fictícios). */
export const createDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ leadId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertCanManageDemo(context);
    return (await demoService()).createDemo({ leadId: data.leadId, actorUserId: context.userId });
  });

/** Volta a demo ao cenário inicial (mesmo link, mesmos ids). */
export const restartDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SessionInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCanManageDemo(context);
    return (await demoService()).restartDemo({
      sessionId: data.sessionId,
      actorUserId: context.userId,
    });
  });

/** Encerra a demo: o cliente perde o acesso; o time continua vendo tudo. */
export const closeDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SessionInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCanManageDemo(context);
    return (await demoService()).closeDemo({
      sessionId: data.sessionId,
      actorUserId: context.userId,
    });
  });

/** Revoga o link atual (a campanha e o histórico seguem para o time). */
export const revokeDemoAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SessionInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCanManageDemo(context);
    return (await demoService()).revokeAccess({
      sessionId: data.sessionId,
      actorUserId: context.userId,
    });
  });

/** Renova a validade (14 dias) — ou gera um link novo (`newLink`, ou se estava revogado). */
export const renewDemoAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    SessionInput.extend({ newLink: z.boolean().optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageDemo(context);
    return (await demoService()).renewAccess({
      sessionId: data.sessionId,
      actorUserId: context.userId,
      newLink: data.newLink,
    });
  });

/** Único ponto que devolve o token (para "Copiar link"). */
export const getDemoLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SessionInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCanManageDemo(context);
    return (await demoService()).getLink(data.sessionId);
  });

/** Demo do lead (a ativa; senão a mais recente) + últimos eventos de ciclo de vida. */
export const getDemoForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ leadId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertCanManageDemo(context);
    return (await demoService()).getDemoForLead(data.leadId);
  });
