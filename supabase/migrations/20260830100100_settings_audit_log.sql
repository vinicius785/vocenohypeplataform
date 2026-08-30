-- Ledger genérico de auditoria de Configurações (precificação, export de
-- dados) — mesmo espírito de `performance_events`: uma tabela só, nunca
-- por-feature.
CREATE TABLE public.settings_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('pricing', 'export')),
  action text NOT NULL,
  detail text,
  actor_id uuid REFERENCES auth.users(id),
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX settings_audit_log_category_created_at_idx
  ON public.settings_audit_log (category, created_at DESC);

ALTER TABLE public.settings_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "configuracoes can read settings_audit_log"
  ON public.settings_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'configuracoes'));

CREATE POLICY "configuracoes can insert settings_audit_log"
  ON public.settings_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'configuracoes') AND auth.uid() = actor_id);
