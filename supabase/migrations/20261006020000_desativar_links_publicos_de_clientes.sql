-- Desativa TODOS os links públicos de cliente (`/portal/$token`): remove `publicToken` de
-- `clientes.data`. O código já não resolve tokens (CLIENT_PUBLIC_LINKS_ENABLED = false em
-- `cliente-link.functions.ts`); esta migration apaga os tokens que ficaram gravados, para que
-- nenhum link antigo volte a funcionar mesmo se o código for revertido.
-- A Demonstração (`/demo/$token`, tabela `demo_sessions`) NÃO é afetada.
UPDATE public.clientes
SET data = data - 'publicToken'
WHERE data ? 'publicToken'
  AND data->>'demoSessionId' IS NULL;
