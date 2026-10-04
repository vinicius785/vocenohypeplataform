/**
 * Autorização das funções de servidor da Demo para o TIME: permissão `comercial`
 * (`has_permission` já inclui os admins). Separada para ser testável sem o runtime das
 * server functions.
 */
export type HasPermissionClient = {
  rpc: (
    fn: "has_permission",
    args: { _user_id: string; _permission: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export const DEMO_MANAGE_PERMISSION = "comercial";

export async function assertCanManageDemo(context: {
  supabase: HasPermissionClient;
  userId: string;
}): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_permission", {
    _user_id: context.userId,
    _permission: DEMO_MANAGE_PERMISSION,
  });
  // Erro ao verificar NUNCA libera (fail-closed) e não vaza o detalhe do banco.
  if (error) throw new Error("Não foi possível verificar sua permissão.");
  if (data !== true) throw new Error("Sem permissão para gerenciar demonstrações.");
}
