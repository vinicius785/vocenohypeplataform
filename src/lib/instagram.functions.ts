import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PublicConnection } from "./instagram/instagram-service";

/** Equipe (permissão `influenciadores`): gerar link, ver estado/métricas, atualizar e desconectar. O token nunca sai do servidor. */
const InfluInput = z.object({ influenciadorId: z.string().uuid() });

async function assertPermission(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _permission: "influenciadores",
  });
  if (error || data !== true) throw new Error("Sem permissão para gerenciar influenciadores.");
}

export const getInstagramConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InfluInput.parse(raw))
  .handler(async ({ data, context }): Promise<PublicConnection & { configured: boolean }> => {
    await assertPermission(context.supabase, context.userId);
    const { toPublicConnection } = await import("./instagram/instagram-service");
    const { buildInstagramDeps } = await import("./instagram/instagram-deps.server");
    try {
      const d = await buildInstagramDeps();
      return {
        ...toPublicConnection(await d.repo.getConnection(data.influenciadorId)),
        configured: true,
      };
    } catch {
      return { ...toPublicConnection(null), configured: false };
    }
  });

export const createInstagramConnectLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InfluInput.parse(raw))
  .handler(async ({ data, context }): Promise<{ url: string; expiresAt: string }> => {
    await assertPermission(context.supabase, context.userId);
    const { createConnectLink } = await import("./instagram/instagram-service");
    const { buildInstagramDeps } = await import("./instagram/instagram-deps.server");
    const { getAppUrl } = await import("./google-oauth-config");
    const d = await buildInstagramDeps();
    const { token, expiresAt } = await createConnectLink(d, {
      influenciadorId: data.influenciadorId,
      createdBy: context.userId,
    });
    return { url: `${getAppUrl()}/conectar-instagram/${token}`, expiresAt };
  });

export const syncInstagramMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InfluInput.parse(raw))
  .handler(async ({ data, context }): Promise<PublicConnection> => {
    await assertPermission(context.supabase, context.userId);
    const { syncMetrics } = await import("./instagram/instagram-service");
    const { buildInstagramDeps } = await import("./instagram/instagram-deps.server");
    return syncMetrics(await buildInstagramDeps(), data.influenciadorId);
  });

export const disconnectInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InfluInput.parse(raw))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPermission(context.supabase, context.userId);
    const { disconnect } = await import("./instagram/instagram-service");
    const { buildInstagramDeps } = await import("./instagram/instagram-deps.server");
    await disconnect(await buildInstagramDeps(), data.influenciadorId);
    return { ok: true };
  });

/** PÚBLICAS (influenciador, sem login): autorizadas só pelo token imprevisível do link. */
const TokenInput = z.object({ token: z.string().max(80) });

export const getInstagramLinkInfo = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => TokenInput.parse(raw))
  .handler(async ({ data }) => {
    const { getPublicLinkInfo } = await import("./instagram/instagram-service");
    const { buildInstagramDeps } = await import("./instagram/instagram-deps.server");
    try {
      return {
        configured: true as const,
        ...(await getPublicLinkInfo(await buildInstagramDeps(), data.token)),
      };
    } catch {
      return { configured: false as const, state: "invalid" as const, firstName: null };
    }
  });

export const startInstagramConnect = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => TokenInput.parse(raw))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { startOAuth } = await import("./instagram/instagram-service");
    const { buildInstagramDeps } = await import("./instagram/instagram-deps.server");
    try {
      return await startOAuth(await buildInstagramDeps(), data.token);
    } catch {
      throw new Error("Não foi possível iniciar a conexão. Peça um novo link.");
    }
  });
