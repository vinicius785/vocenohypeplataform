-- Resultados do mini sudoku diário (grid 6x6), mesmo padrão do
-- zip_daily_results: puzzle gerado no cliente a partir da data, só o
-- resultado de cada jogador fica salvo — um por pessoa por dia.
CREATE TABLE public.sudoku_daily_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_key TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date_key)
);

GRANT SELECT, INSERT ON public.sudoku_daily_results TO authenticated;
GRANT ALL ON public.sudoku_daily_results TO service_role;

ALTER TABLE public.sudoku_daily_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own sudoku result" ON public.sudoku_daily_results
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "authenticated read sudoku results" ON public.sudoku_daily_results
  FOR SELECT TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.sudoku_daily_results;
