-- `resetZipProgress` (src/lib/games/zip.functions.ts) sempre chamou
-- `.delete()` em daily_game_sessions, mas a tabela só tinha políticas de
-- SELECT/INSERT/UPDATE — o delete silenciosamente afetava 0 linhas (sem
-- erro), então "Reiniciar" nunca de fato limpava a sessão no banco.
create policy "own game sessions delete" on public.daily_game_sessions
  for delete
  using (user_id = auth.uid());
