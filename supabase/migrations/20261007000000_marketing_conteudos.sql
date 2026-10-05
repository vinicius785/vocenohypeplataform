-- Calendário Editorial do projeto Marketing (Você no Hype): uma linha por conteúdo planejado.
-- Tabela própria (não JSON dentro do projeto): cada conteúdo é salvo isoladamente, e o calendário
-- busca só o período visível (índice em projeto_id + data).
--
-- Acesso: time interno com a permissão `projetos` (has_permission já inclui admin). Contas de
-- cliente do Portal NÃO passam (mesma regra de 2026-10: dado interno exige is_internal_team_member
-- ou admin).

CREATE TABLE public.marketing_conteudos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL CHECK (char_length(btrim(titulo)) > 0),
  data DATE NOT NULL,
  hora TIME,
  canal TEXT NOT NULL CHECK (canal IN ('instagram','tiktok','youtube','linkedin','x','facebook','blog','outro')),
  formato TEXT NOT NULL CHECK (formato IN ('reels','stories','post','carrossel','video','short','artigo','live','outro')),
  status TEXT NOT NULL DEFAULT 'planejado' CHECK (status IN ('ideia','planejado','em_producao','em_aprovacao','ajustes','aprovado','publicado','cancelado')),
  -- Id do membro (mesmo id de `time:membros`) e id da tarefa no diretório de tarefas: referências
  -- soltas de propósito (sem FK) — membro/tarefa removidos não podem apagar o conteúdo.
  responsavel_id TEXT,
  descricao TEXT,
  tarefa_id TEXT,
  criado_por UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX marketing_conteudos_projeto_data_idx ON public.marketing_conteudos (projeto_id, data);

CREATE TRIGGER marketing_conteudos_set_updated_at
BEFORE UPDATE ON public.marketing_conteudos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.marketing_conteudos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_conteudos TO authenticated;
GRANT ALL ON public.marketing_conteudos TO service_role;

CREATE POLICY "projetos read marketing_conteudos" ON public.marketing_conteudos
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'projetos')
    AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
  );
CREATE POLICY "projetos insert marketing_conteudos" ON public.marketing_conteudos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'projetos')
    AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
  );
CREATE POLICY "projetos update marketing_conteudos" ON public.marketing_conteudos
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'projetos')
    AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'projetos')
    AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
  );
CREATE POLICY "projetos delete marketing_conteudos" ON public.marketing_conteudos
  FOR DELETE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'projetos')
    AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
  );

-- Marcador ESTÁVEL do projeto Marketing (a plataforma não depende mais do nome visual). Idempotente.
UPDATE public.projetos
SET data = data || '{"systemKey":"marketing"}'::jsonb
WHERE upper(btrim(data->>'name')) = 'MARKETING'
  AND NOT (data ? 'systemKey');
