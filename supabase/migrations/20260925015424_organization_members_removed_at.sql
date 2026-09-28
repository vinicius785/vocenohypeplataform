-- Aditivo: `client-access.functions.ts` ("Pessoas e acessos", autoatendimento
-- do cliente) precisa registrar QUANDO um convite foi cancelado ou um
-- acesso foi removido, sem sobrescrever `updated_at` genérico (que já é
-- tocado por qualquer outra mudança na linha). Nenhuma linha existente é
-- afetada — coluna nova, nullable.
ALTER TABLE public.organization_members
  ADD COLUMN removed_at TIMESTAMPTZ;
