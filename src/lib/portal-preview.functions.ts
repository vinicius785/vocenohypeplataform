import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCanPreviewClientPortal } from "@/lib/portal-preview-permission";
import { throwSafeDbError } from "@/lib/portal-db-error";

/**
 * Visualização do portal do cliente PELO TIME, sem login/senha do cliente: a pessoa já está
 * autenticada como membro da equipe, e a autorização é a permissão dela (`clientes` ou
 * `campanhas`, equipe interna/admin). Devolve os MESMOS dados do portal real, sempre com o
 * papel `client_viewer` — o portal esconde toda ação de escrita, e não existe nenhuma função de
 * escrita nesta rota (somente leitura, por construção).
 */
const PreviewInput = z.object({ clienteId: z.string().uuid() });

export const getPortalPreviewData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PreviewInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCanPreviewClientPortal(
      context as unknown as Parameters<typeof assertCanPreviewClientPortal>[0],
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("clientes")
      .select("id, data")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (error) throwSafeDbError(error);
    if (!row) throw new Error("Cliente não encontrado.");
    const { buildClienteLinkData } = await import("@/lib/cliente-link.functions");
    const base = await buildClienteLinkData(row.id, row.data as never);
    return { ...base, role: "client_viewer" };
  });

const PreviewArtigoInput = z.object({ clienteId: z.string().uuid(), postId: z.string().min(1) });

/** Curtidas e comentários de um artigo, vistos pelo TIME na visualização do cliente. Somente
 * leitura; confere a permissão do time e que o artigo é MESMO visível a esse cliente. */
export const getPortalPreviewArtigoEngagement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => PreviewArtigoInput.parse(raw))
  .handler(async ({ data, context }) => {
    await assertCanPreviewClientPortal(
      context as unknown as Parameters<typeof assertCanPreviewClientPortal>[0],
    );
    const { assertArtigoVisivelAoCliente, readArtigoEngagement } =
      await import("@/lib/cliente-link.functions");
    await assertArtigoVisivelAoCliente(data.clienteId, data.postId);
    return readArtigoEngagement(data.clienteId, data.postId);
  });
