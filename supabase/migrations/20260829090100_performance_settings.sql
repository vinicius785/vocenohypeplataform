-- Pesos/regras configuráveis do Score Operacional e XP (Performance do
-- Time). Singleton, mesmo padrão de pricing_settings (20260814150000).
-- O corte de 19h (regra central de "vencimento" de tarefa) fica FORA
-- daqui de propósito — é fixo/global, não configurável nesta rodada.
CREATE TABLE public.performance_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  weight_execucao numeric NOT NULL DEFAULT 0.5,
  weight_pendencias numeric NOT NULL DEFAULT 0.3,
  weight_compromissos numeric NOT NULL DEFAULT 0.2,
  pendencias_dias_teto integer NOT NULL DEFAULT 10,
  xp_task_on_time integer NOT NULL DEFAULT 10,
  xp_task_early_bonus integer NOT NULL DEFAULT 2,
  xp_meeting_attended integer NOT NULL DEFAULT 2,
  xp_meeting_missed integer NOT NULL DEFAULT -5,
  xp_overdue_dias_teto integer NOT NULL DEFAULT 10,
  motivo_isencao_default jsonb NOT NULL DEFAULT '{
    "dependencia_cliente": true,
    "mudanca_escopo": true,
    "prioridade_lideranca": true,
    "dependencia_interna": true,
    "replanejamento_operacional": false,
    "atraso_responsavel": false,
    "outro": false
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.performance_settings TO authenticated;
GRANT ALL ON public.performance_settings TO service_role;
ALTER TABLE public.performance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read performance settings" ON public.performance_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins update performance settings" ON public.performance_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER performance_settings_updated_at
  BEFORE UPDATE ON public.performance_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.performance_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.performance_settings;
