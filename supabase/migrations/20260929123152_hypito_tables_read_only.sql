-- Remoção do Hypito: para as tabelas exclusivas do bot, nenhuma linha ou
-- tabela é apagada (dado histórico preservado), mas nenhum código restante
-- deve conseguir escrever nelas (a automação/cron que escrevia foi
-- removida do app). 4 tabelas já só tinham SELECT admin (nada a fazer
-- aqui). Estas 6 tinham uma única policy `FOR ALL` cobrindo leitura E
-- escrita — trocamos por uma policy `FOR SELECT` só de leitura, com
-- EXATAMENTE o mesmo `USING` de antes, então quem já podia ler continua
-- lendo, e ninguém mais consegue inserir/atualizar/apagar.

drop policy if exists "own hypito conversation state" on public.hypito_conversation_state;
create policy "own hypito conversation state (read only)" on public.hypito_conversation_state
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own meeting reminders" on public.hypito_meeting_reminders_sent;
create policy "own meeting reminders (read only)" on public.hypito_meeting_reminders_sent
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own pending actions" on public.hypito_pending_actions;
create policy "own pending actions (read only)" on public.hypito_pending_actions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own reminders read/cancel" on public.hypito_reminders;
create policy "own reminders (read only)" on public.hypito_reminders
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own hypito prefs" on public.hypito_user_prefs;
create policy "own hypito prefs (read only)" on public.hypito_user_prefs
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "admin manage hypito_report_settings" on public.hypito_report_settings;
create policy "admin read hypito_report_settings (read only)" on public.hypito_report_settings
  for select to authenticated
  using (is_admin(auth.uid()));
