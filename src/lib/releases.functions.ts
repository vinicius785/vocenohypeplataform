import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { compareSemver, isValidSemver } from "./semver";
import { mapPlatformReleaseRow } from "./platform-releases";

/** Item de changelog — sempre texto puro (nunca HTML). Renderizado só
 * como texto no cliente, nunca via `dangerouslySetInnerHTML` — é a
 * defesa contra XSS injetado no changelog (Seção 18/19 do pedido). */
const ChangeItem = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
});

const PublishInput = z.object({
  version: z.string(),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500).optional().default(""),
  changes: z.array(ChangeItem).default([]),
  environment: z.enum(["production", "preview", "development"]).default("production"),
  requiresReload: z.boolean().default(false),
  minimumSupportedVersion: z.string().optional(),
});

/** Publica uma nova release — só admin (mesma checagem `is_admin` já
 * usada em `team.functions.ts`). Valida SemVer, rejeita versão igual ou
 * inferior à mais recente já publicada (nunca compara como string — usa
 * `compareSemver`), e a política RLS da tabela (`platform_releases_insert_admin`)
 * é a segunda linha de defesa server-side caso este código seja
 * contornado. Só releases `environment: "production"` disparam aviso —
 * isso é decidido no client do canal realtime (`release-watch.ts`), não
 * aqui; esta função só garante que o registro é gravado corretamente. */
export const publishRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PublishInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: adminErr } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Apenas administradores podem publicar uma release.");

    if (!isValidSemver(data.version)) {
      throw new Error(`Versão inválida: "${data.version}" (esperado MAJOR.MINOR.PATCH).`);
    }

    const { data: latestRow, error: latestErr } = await context.supabase
      .from("platform_releases")
      .select("version")
      .order("released_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) throw new Error(latestErr.message);
    if (latestRow && compareSemver(data.version, latestRow.version) <= 0) {
      throw new Error(
        `Versão ${data.version} não é maior que a última publicada (${latestRow.version}).`,
      );
    }

    const { data: inserted, error } = await context.supabase
      .from("platform_releases")
      .insert({
        version: data.version,
        title: data.title,
        summary: data.summary || null,
        changes: data.changes,
        environment: data.environment,
        requires_reload: data.requiresReload,
        minimum_supported_version: data.minimumSupportedVersion || null,
        released_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapPlatformReleaseRow(inserted);
  });

// Leitura (histórico, última release) não passa por server function —
// a policy RLS `platform_releases_select_authenticated` já libera
// qualquer autenticado, então lê-se direto via `supabase` do browser
// (`src/integrations/supabase/client.ts`), mesmo padrão já usado por
// `shared-sync.ts`/`workspace-store.ts` — evita duas formas diferentes
// de buscar o mesmo dado (uma via server fn, outra direta). Ver
// `platform-releases.ts` (tipo `PlatformRelease` + `mapPlatformReleaseRow`
// compartilhados) e `release-watch.ts`/`ReleaseHistoryDialog.tsx`.
