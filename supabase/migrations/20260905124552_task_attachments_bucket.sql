-- Anexos de tarefa (Projetos/Campanhas/Marketing) eram salvos como data URL
-- (base64) direto no campo `attachments` da tarefa/subtarefa, dentro do
-- jsonb de `projeto_tarefas`/`campanha_tarefas`/`marketing_standalone_tasks`.
-- Isso não escala: um punhado de screenshots/PDFs em subtarefas de uma
-- única tarefa já produziu uma linha de ~6.6MB (task "Acesso dos crawlers e
-- navegação agêntica"), e toda vez que QUALQUER campo da tarefa muda (até
-- só o status), o objeto inteiro — anexos embutidos incluídos — precisa ser
-- reenviado por inteiro, o que estava dando timeout ao salvar. Mesmo padrão
-- já usado em "chat-attachments"/"financeiro-anexos": bucket privado,
-- upload por qualquer autenticado (dono = quem fez upload), leitura por
-- qualquer autenticado (anexo de tarefa é visto por todo o time, igual já
-- acontece hoje), exclusão só pelo dono.
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

create policy "task_attachments_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'task-attachments' and owner = auth.uid());

create policy "task_attachments_read_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'task-attachments');

create policy "task_attachments_delete_own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'task-attachments' and owner = auth.uid());
