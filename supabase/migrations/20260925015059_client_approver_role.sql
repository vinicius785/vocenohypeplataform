-- Adiciona 'client_approver' como um terceiro papel de cliente, entre
-- client_standard ("Administrador" — já é quem `is_active_client_admin_of`
-- reconhece como admin, ver 20260918180000/20260922184944) e client_viewer
-- ("Visualizador", somente leitura). Aditivo: nenhuma linha existente é
-- remapeada — client_standard continua significando exatamente o que já
-- significava (nunca renomeado), só ganha uma opção nova ao lado.
--
-- `assertCanMutate` (portal-auth.functions.ts) já bloqueia só
-- `client_viewer` (nunca uma allowlist) — client_approver herda
-- automaticamente a capacidade de aprovar/comentar/solicitar ajuste sem
-- nenhuma mudança de código ali. `is_active_client_admin_of` continua
-- checando especificamente `client_standard`, então um client_approver
-- nunca é tratado como admin (não gerencia pessoas/papéis/acessos).
ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('internal_admin', 'internal_member', 'client_standard', 'client_viewer', 'client_approver'));
