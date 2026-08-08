-- Resultados do jogo diário "Zip" (puzzle de conectar pontos numerados,
-- gerado deterministicamente a partir da data — não precisa ser guardado
-- aqui, só o resultado de cada jogador). Um resultado por pessoa por dia.
CREATE TABLE public.zip_daily_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_key TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  moves INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date_key)
);

GRANT SELECT, INSERT ON public.zip_daily_results TO authenticated;
GRANT ALL ON public.zip_daily_results TO service_role;

ALTER TABLE public.zip_daily_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own zip result" ON public.zip_daily_results
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "authenticated read zip results" ON public.zip_daily_results
  FOR SELECT TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.zip_daily_results;
