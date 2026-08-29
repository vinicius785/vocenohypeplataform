-- Ledger append-only e imutável de eventos de performance (Score
-- Operacional + XP) — nunca editado/apagado por nenhum fluxo do app
-- (sem GRANT de UPDATE/DELETE, garantia no nível do Postgres). Colunas
-- reais (não `{id, data jsonb}` como o resto do app) porque este ledger
-- é sempre filtrado por pessoa+período em volume, o que exige índice
-- decente — molde é `bug_reports`, não `metas`/`projeto_tarefas`.
CREATE TABLE public.performance_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'task_completed', 'task_reopened', 'task_deadline_changed',
    'task_assignee_changed', 'meeting_attendance_recorded'
  )),
  -- Assignee de tarefa é NOME hoje, não id (dívida pré-existente) — a
  -- resolução nome->id pode falhar (membro renomeado/removido), então
  -- person_id fica nullable e person_name é sempre gravado como
  -- fallback, pra nunca perder o evento por falha de matching.
  person_id UUID REFERENCES auth.users(id),
  person_name TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  actor_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Denormalizado de propósito: sobrevive à exclusão da tarefa original
  -- (drill-down do Score continua funcionando mesmo pra tarefa já
  -- apagada, já que projeto_tarefas/campanha_tarefas fazem hard delete).
  task_id UUID,
  task_origin TEXT CHECK (task_origin IN ('projeto', 'campanha', 'marketing')),
  task_title TEXT,
  meeting_id UUID,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX performance_events_person_occurred_idx
  ON public.performance_events (person_id, occurred_at);
CREATE INDEX performance_events_type_occurred_idx
  ON public.performance_events (event_type, occurred_at);
CREATE INDEX performance_events_task_idx
  ON public.performance_events (task_id);

-- Imutabilidade via RLS: só existem policies de SELECT/INSERT abaixo —
-- sem NENHUMA policy de UPDATE/DELETE, o Postgres nega essas operações
-- por padrão (0 linhas afetadas) pra `authenticated`/`anon`, mesmo que o
-- GRANT geral do projeto (aplicado a toda tabela nova neste banco,
-- confirmado via `bug_reports`) inclua UPDATE/DELETE/TRUNCATE — a ACL
-- ampla nunca supera a ausência de policy permissiva. `service_role`
-- continua podendo tudo, pra correção manual via SQL fora do fluxo do
-- app quando genuinamente necessário.
GRANT SELECT, INSERT ON public.performance_events TO authenticated;
GRANT ALL ON public.performance_events TO service_role;
ALTER TABLE public.performance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own performance events" ON public.performance_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "authenticated read performance events" ON public.performance_events
  FOR SELECT TO authenticated USING (true);

-- Cresce indefinidamente e nenhuma tela precisa de push instantâneo
-- evento-a-evento (um refetch ao montar o dashboard de Time basta) —
-- de propósito NÃO entra na publicação de realtime.
