-- Endurecimento dos 2 objetos novos de 20261001120000_campanha_nps_influenciador.sql,
-- conforme os advisors de segurança do Supabase:
-- 1. `ensure_campanha_nps_influenciador` é SECURITY DEFINER só para a
--    trigger conseguir inserir na tabela de NPS independente de quem
--    disparou o UPDATE em `campanha_influenciadores` — nunca deveria ser
--    chamável diretamente via RPC (`/rest/v1/rpc/...`). Revoga EXECUTE de
--    anon/authenticated; o Postgres continua disparando a trigger
--    normalmente (isso não depende de grant de EXECUTE do papel que fez o
--    UPDATE na tabela).
-- 2. `search_path` explícito nas 2 funções novas (mutable search_path é
--    reportado pelo linter de segurança do Supabase para toda função
--    SECURITY DEFINER/trigger sem isso — mesmo aviso pré-existente em
--    `campanha_nps_set_updated_at`, não introduzido por nós, mas evitado
--    aqui pros objetos novos).

revoke execute on function public.ensure_campanha_nps_influenciador() from public, anon, authenticated;

alter function public.campanha_nps_influenciador_set_updated_at() set search_path = public;
