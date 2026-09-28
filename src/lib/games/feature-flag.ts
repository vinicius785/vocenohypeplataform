import { useMyAccess } from "@/lib/permissions";

/**
 * Contenção temporária dos jogos (ZIP/Termo) — "Pausa rápida" fica
 * escondida do dashboard pra usuários comuns em produção até os
 * critérios de aceite da reconstrução passarem (não removida, só
 * desligada por flag). Em desenvolvimento, ou pra quem é admin, os
 * jogos continuam visíveis/acessíveis — inclusive pela rota isolada
 * `/dev/jogos`, pensada pra homologar sem afetar o dashboard de
 * ninguém mais.
 *
 * Reativar de verdade (não só marcar `true` aqui) só depois que:
 * INSERT/UPDATE de sessão funcionarem sem erro, RLS impedir acesso
 * cruzado, ZIP iniciar corretamente no 1 e persistir sem toast de
 * erro, Termo aceitar TERMO/PEITO/AUREA, e a homologação em
 * `/dev/jogos` (banco real, sem mocks) confirmar tudo isso.
 */
export function useGamesEnabled(): boolean {
  const access = useMyAccess();
  if (import.meta.env.DEV) return true;
  return !!access?.isAdmin;
}
