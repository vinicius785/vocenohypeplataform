/**
 * Autorização da VISUALIZAÇÃO do portal do cliente pelo TIME (sem login do cliente): só equipe
 * interna/admin com permissão em `clientes` ou `campanhas`. Separada para ser testável sem o
 * runtime das server functions. Erro ao verificar NUNCA libera (fail-closed).
 */
export type PermissionRpcClient = {
  rpc: (
    fn: "has_permission" | "is_internal_team_member" | "is_admin",
    args: Record<string, string>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export const PORTAL_PREVIEW_PERMISSIONS = ["clientes", "campanhas"] as const;

export async function assertCanPreviewClientPortal(context: {
  supabase: PermissionRpcClient;
  userId: string;
}): Promise<void> {
  const deny = () => new Error("Sem permissão para visualizar o portal do cliente.");
  const call = async (
    fn: "has_permission" | "is_internal_team_member" | "is_admin",
    extra = {},
  ) => {
    const { data, error } = await context.supabase.rpc(fn, { _user_id: context.userId, ...extra });
    if (error) throw new Error("Não foi possível verificar sua permissão.");
    return data === true;
  };

  const internal = (await call("is_internal_team_member")) || (await call("is_admin"));
  if (!internal) throw deny();
  for (const permission of PORTAL_PREVIEW_PERMISSIONS) {
    if (await call("has_permission", { _permission: permission })) return;
  }
  throw deny();
}
