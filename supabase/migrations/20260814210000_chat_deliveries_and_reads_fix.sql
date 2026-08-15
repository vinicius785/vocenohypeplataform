-- Recibos de entrega/leitura do chat estavam quebrados: a policy de
-- chat_reads só permitia SELECT da própria linha (`auth.uid() = user_id`),
-- então `reloadAllReads()` (que precisa ler a marca de leitura DA OUTRA
-- PESSOA pra saber se ela já viu a mensagem) nunca via nada além da linha
-- do próprio usuário — o "✓✓ Visto" nunca acendia, mesmo em DM. Corrige
-- pra permitir leitura geral (marca de leitura não é dado sensível — mesmo
-- padrão já usado em chat_status), mantendo a escrita restrita à própria
-- linha.
DROP POLICY IF EXISTS "user manage own reads" ON public.chat_reads;
CREATE POLICY "authenticated read all reads" ON public.chat_reads
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "user upsert own read" ON public.chat_reads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user update own read" ON public.chat_reads
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user delete own read" ON public.chat_reads
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Novo: marca de ENTREGA (chegou no dispositivo do outro, via realtime) —
-- distinto de "lido" (a pessoa abriu a conversa). Mesmo formato de
-- chat_reads, uma linha por (usuário, conversa) com o carimbo mais recente.
CREATE TABLE IF NOT EXISTS public.chat_deliveries (
  user_id uuid NOT NULL,
  convo_id text NOT NULL,
  last_delivered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, convo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_deliveries TO authenticated;
GRANT ALL ON public.chat_deliveries TO service_role;
ALTER TABLE public.chat_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read all deliveries" ON public.chat_deliveries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "user upsert own delivery" ON public.chat_deliveries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user update own delivery" ON public.chat_deliveries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user delete own delivery" ON public.chat_deliveries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
