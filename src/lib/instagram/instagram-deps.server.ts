import { getAppUrl } from "../google-oauth-config";
import { InstagramClient, InstagramError } from "./instagram-client";
import { createSupabaseInstagramRepo } from "./instagram-repo.server";
import type { Deps } from "./instagram-service";

/** Monta as dependências reais (service role + segredos de ambiente). Sem a configuração completa, nada conecta. */
export async function buildInstagramDeps(): Promise<Deps> {
  const appId = process.env.INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  const hashKey = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret || !hashKey) throw new InstagramError("not_configured");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    repo: createSupabaseInstagramRepo(supabaseAdmin),
    client: new InstagramClient({ appId, appSecret }),
    appId,
    appSecret,
    hashKey,
    redirectUri: `${getAppUrl()}/api/instagram/oauth-callback`,
  };
}
