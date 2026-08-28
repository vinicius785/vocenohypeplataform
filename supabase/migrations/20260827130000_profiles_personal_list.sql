-- "Lista pessoal" no Início vivia só em localStorage (`inicio.personal`),
-- então não acompanhava o usuário entre dispositivos/navegadores. Vira um
-- campo por-perfil, mesma RLS de auto-gestão já existente pra profiles
-- ("users update own profile": auth.uid() = id) — sem tabela nova.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_list jsonb NOT NULL DEFAULT '[]'::jsonb;
