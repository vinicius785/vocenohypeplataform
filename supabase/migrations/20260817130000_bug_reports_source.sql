-- Bugs da PLATAFORMA (botão flutuante global + portal do cliente) e bugs/
-- sugestões do HYPEAPP (aba dedicada em Projetos) são conceitos diferentes
-- e não devem se misturar nas listagens (Time mostra só plataforma; o
-- painel do Projeto HypeApp mostra só hypeapp). Default 'plataforma' cobre
-- todas as linhas existentes e os dois caminhos de escrita que não
-- informam a origem explicitamente (botão flutuante, portal do cliente).
ALTER TABLE public.bug_reports
  ADD COLUMN source TEXT NOT NULL DEFAULT 'plataforma' CHECK (source IN ('plataforma', 'hypeapp'));

-- Backfill: linhas já enviadas pelo painel do HypeApp sempre têm `scope`
-- preenchido (o floating button/portal nunca perguntam isso) — usa isso
-- só pra corrigir o `source` das linhas que já existiam antes da coluna.
UPDATE public.bug_reports SET source = 'hypeapp' WHERE scope IS NOT NULL;
