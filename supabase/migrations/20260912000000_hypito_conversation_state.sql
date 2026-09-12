-- Estado da conversa do Hypito — resumo estruturado (não o histórico
-- inteiro) do que está em aberto pra cada pessoa: última intenção,
-- entidade em foco, pergunta de esclarecimento pendente, rascunho de
-- ação em preenchimento progressivo. Uma linha por usuário (cada pessoa
-- tem só uma conversa com o Hypito hoje — ver `dmId()`/`HYPITO_AUTHOR_ID`
-- em `src/lib/hypito.ts`).
--
-- Idempotente (`IF NOT EXISTS`) e reversível (`DROP TABLE` desfaz sem
-- afetar nenhuma outra tabela — não há FK apontando PRA cá).
--
-- Diagnóstico do erro "Could not find the table 'public.hypito_pending_actions'
-- in the schema cache" (pedido desta tarefa): a tabela e a migration
-- SEMPRE existiram corretas (nome, colunas e policies batem exatamente
-- com o que `hypito-actions.server.ts` espera) — o erro era o cache de
-- schema do PostgREST ainda não ter sido atualizado no instante entre a
-- aplicação da migration e a primeira consulta. `NOTIFY pgrst, 'reload
-- schema'` no fim deste arquivo força esse refresh imediatamente após
-- qualquer migration nova do Hypito, em vez de depender só do reload
-- automático/periódico do Supabase.
CREATE TABLE IF NOT EXISTS public.hypito_conversation_state (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id text NOT NULL DEFAULT 'default',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hypito_conversation_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hypito_conversation_state TO authenticated;
GRANT ALL ON public.hypito_conversation_state TO service_role;
CREATE POLICY "own hypito conversation state" ON public.hypito_conversation_state
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
