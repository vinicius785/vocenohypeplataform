-- Disponibilidade das Reuniões vivia como um único registro global em
-- `shared_state` (chave "reunioes:disponibilidade") — sem nenhum conceito
-- de "de quem" era aquela disponibilidade: qualquer pessoa que editasse
-- sobrescrevia a configuração de todo mundo, e o resto do app não tinha
-- como saber quando UM membro específico estava indisponível. Move pra
-- uma tabela per-row de verdade, uma linha por membro do time (id = id do
-- membro), mesmo padrão de `reunioes`/`clientes`/`projetos`.
CREATE TABLE public.reunioes_disponibilidade (
  id UUID NOT NULL PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reunioes_disponibilidade TO authenticated;
GRANT ALL ON public.reunioes_disponibilidade TO service_role;
ALTER TABLE public.reunioes_disponibilidade ENABLE ROW LEVEL SECURITY;
-- Leitura aberta pro time todo (precisa ver a indisponibilidade alheia pra
-- não marcar reunião em cima); escrita só na própria linha.
CREATE POLICY "authenticated read reunioes_disponibilidade"
ON public.reunioes_disponibilidade FOR SELECT TO authenticated USING (true);
CREATE POLICY "self insert reunioes_disponibilidade"
ON public.reunioes_disponibilidade FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "self update reunioes_disponibilidade"
ON public.reunioes_disponibilidade FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "self delete reunioes_disponibilidade"
ON public.reunioes_disponibilidade FOR DELETE TO authenticated USING (id = auth.uid());
CREATE TRIGGER reunioes_disponibilidade_set_updated_at
BEFORE UPDATE ON public.reunioes_disponibilidade
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER PUBLICATION supabase_realtime ADD TABLE public.reunioes_disponibilidade;
