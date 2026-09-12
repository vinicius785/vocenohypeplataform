/**
 * Autorização server-side do Hypito — sempre no contexto do usuário que
 * está conversando, NUNCA usando um acesso "global" do bot (pedido,
 * seção 4: "não permitir acesso global usando as permissões do bot").
 *
 * Reaproveita exatamente o que já existe: a mesma função SQL
 * `has_permission`/`is_admin` que a RLS de `clientes`/`campanhas`/
 * `projetos` já usa (`supabase/migrations/20260729190000_permission_scoped_rls.sql`),
 * chamada aqui via RPC com o client `supabaseAdmin` — não existe endpoint
 * server-side equivalente a `useMyAccess()` (que é 100% client, lê
 * `localStorage`), então este é o primeiro.
 *
 * A plataforma não tem hoje nenhum conceito de visibilidade POR REGISTRO
 * (nenhum projeto/campanha tem `private`/`allowedUserIds` — confirmado
 * por leitura direta das migrations) — permissão é só por MÓDULO. O
 * Hypito aplica exatamente essa mesma régua, nem mais solta nem mais
 * apertada que o resto da plataforma hoje.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;

export type HypitoPermission =
  | "projetos"
  | "campanhas"
  | "clientes"
  | "reunioes"
  | "comercial"
  | "influenciadores";

export type UserAccess = { userId: string; isAdmin: boolean; permissions: string[] };

export async function loadUserAccess(db: DB, userId: string): Promise<UserAccess> {
  const [{ data: isAdminData }, { data: profile }] = await Promise.all([
    db.rpc("is_admin", { _user_id: userId }),
    db.from("profiles").select("permissions").eq("id", userId).maybeSingle(),
  ]);
  return {
    userId,
    isAdmin: Boolean(isAdminData),
    permissions: (Array.isArray(profile?.permissions) ? profile.permissions : []) as string[],
  };
}

export function can(access: UserAccess, permission: HypitoPermission): boolean {
  return access.isAdmin || access.permissions.includes(permission);
}

/** Nunca deixa o texto do usuário "convencer" o Hypito a ampliar acesso —
 * a permissão é sempre resolvida ANTES de qualquer interpretação de
 * texto, a partir do `userId` real da sessão, nunca de algo que o
 * usuário escreveu na mensagem (pedido: "o usuário nunca deve conseguir
 * ampliar seu acesso pedindo isso ao Hypito"). */
export function assertCan(access: UserAccess, permission: HypitoPermission): void {
  if (!can(access, permission)) {
    throw new Error(`Sem permissão de "${permission}" para esta consulta.`);
  }
}
