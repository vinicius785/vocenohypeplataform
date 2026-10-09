-- Aparelho do ÚLTIMO acesso ao portal (computador / celular / tablet), gravado pelo servidor
-- junto com `last_access_at`. Só o último: não há histórico por acesso.
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS last_access_device text
  CHECK (last_access_device IS NULL OR last_access_device IN ('desktop', 'mobile', 'tablet'));
