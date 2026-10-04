# RLS: dados internos só para membros internos (migration 20261004000000)

> **Status: NÃO APLICADA.** A migration está em `supabase/migrations/20261004000000_restrict_internal_data_to_internal_members.sql` (sintaxe validada por parser, nunca executada contra o banco). Aplicar só depois de conferir o banco vivo com as consultas abaixo.

## Por que
Contas do Portal do Cliente usam o mesmo Supabase Auth e a mesma chave anon (pública no front) que a equipe. Qualquer policy `TO authenticated USING (true)` vale para elas. A análise estática das migrations (aplicando `create`/`drop policy` em ordem) encontrou:

| Alvo | Antes | Risco |
|---|---|---|
| `pricing_settings` | SELECT para qualquer autenticado | cliente lê margem, comissão, imposto e bonificação da agência |
| `shared_state` | SELECT para qualquer autenticado; UPDATE com `auth.uid() IS NOT NULL` | cliente lê e altera estado compartilhado do app |
| `task_tags`, `aeo_prompts`, `aeo_respostas`, `aeo_rodadas` | CRUD para qualquer autenticado | cliente lê/edita/apaga dados internos |
| `email_sends`, `email_unsubscribes` | SELECT para qualquer autenticado | e-mails de destinatários de campanhas |
| `performance_events`, `performance_settings`, `reunioes_disponibilidade` | SELECT para qualquer autenticado | desempenho e agenda do time |
| `blog_likes`, `blog_comments` | ALL para qualquer autenticado | apagar/forjar interações |
| Storage `entrega-anexos`, `financeiro-anexos`, `relatorios-mensais`, `aeo-evidencias`, `task-attachments` | SELECT/INSERT/DELETE `TO authenticated` só com `bucket_id` | **cliente lista e baixa relatórios de outros clientes e anexos financeiros**; upload livre |

O Portal do Cliente **não depende** disso: acessa esses dados por server functions com service-role (ignoram RLS) e, com o cliente do usuário, só `profiles` e o bucket `avatars`.

## Conferir ANTES de aplicar (SQL Editor do Supabase)
```sql
-- 1) Confirma que o estado vivo bate com a análise: policies "abertas" restantes
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public','storage')
  and (qual = 'true' or with_check = 'true')
order by schemaname, tablename;

-- 2) Quem PERDERIA acesso: perfis que não são admin, nem membro de organização interna,
--    nem membro de organização de cliente. Esperado: 0 linhas.
select p.id, p.email
from public.profiles p
where not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin')
  and not exists (
    select 1 from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.user_id = p.id and om.status = 'active' and o.status = 'active' and o.type = 'internal')
  and not exists (
    select 1 from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.user_id = p.id and o.type = 'client');

-- 3) Dos usuários internos reais, todos passam em is_internal_team_member?
select p.email, public.is_internal_team_member(p.id) as interno, public.is_admin(p.id) as admin
from public.profiles p order by interno, admin;
```

## Testar DEPOIS de aplicar
1. Logar como membro da equipe: abrir Comercial (precificação no simulador), Marketing → AEO, tags de tarefa, anexos de uma entrega, anexo financeiro, relatório mensal. Tudo deve continuar funcionando.
2. Logar no Portal V2 como cliente: abrir Início, Campanhas, Relatórios (baixar um relatório), Arquivos. Tudo deve continuar funcionando (usa service-role).
3. Com o JWT de um cliente (devtools → sessão), tentar `select` em `pricing_settings` e `storage.from('relatorios-mensais').list()`: deve voltar vazio/negado.

## Rollback
O arquivo de rollback recria as policies exatamente como estavam (inclui a remoção do índice):
```sql
DROP POLICY IF EXISTS "authenticated read pricing" ON public.pricing_settings;
CREATE POLICY "authenticated read pricing" ON public.pricing_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read task_tags" ON public.task_tags;
CREATE POLICY "authenticated read task_tags" ON public.task_tags FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated insert task_tags" ON public.task_tags;
CREATE POLICY "authenticated insert task_tags" ON public.task_tags FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated update task_tags" ON public.task_tags;
CREATE POLICY "authenticated update task_tags" ON public.task_tags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated delete task_tags" ON public.task_tags;
CREATE POLICY "authenticated delete task_tags" ON public.task_tags FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read aeo_prompts" ON public.aeo_prompts;
CREATE POLICY "authenticated read aeo_prompts" ON public.aeo_prompts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated insert aeo_prompts" ON public.aeo_prompts;
CREATE POLICY "authenticated insert aeo_prompts" ON public.aeo_prompts FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated update aeo_prompts" ON public.aeo_prompts;
CREATE POLICY "authenticated update aeo_prompts" ON public.aeo_prompts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated delete aeo_prompts" ON public.aeo_prompts;
CREATE POLICY "authenticated delete aeo_prompts" ON public.aeo_prompts FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read aeo_respostas" ON public.aeo_respostas;
CREATE POLICY "authenticated read aeo_respostas" ON public.aeo_respostas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated insert aeo_respostas" ON public.aeo_respostas;
CREATE POLICY "authenticated insert aeo_respostas" ON public.aeo_respostas FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated update aeo_respostas" ON public.aeo_respostas;
CREATE POLICY "authenticated update aeo_respostas" ON public.aeo_respostas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated delete aeo_respostas" ON public.aeo_respostas;
CREATE POLICY "authenticated delete aeo_respostas" ON public.aeo_respostas FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read aeo_rodadas" ON public.aeo_rodadas;
CREATE POLICY "authenticated read aeo_rodadas" ON public.aeo_rodadas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated insert aeo_rodadas" ON public.aeo_rodadas;
CREATE POLICY "authenticated insert aeo_rodadas" ON public.aeo_rodadas FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated update aeo_rodadas" ON public.aeo_rodadas;
CREATE POLICY "authenticated update aeo_rodadas" ON public.aeo_rodadas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated delete aeo_rodadas" ON public.aeo_rodadas;
CREATE POLICY "authenticated delete aeo_rodadas" ON public.aeo_rodadas FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read email_sends" ON public.email_sends;
CREATE POLICY "authenticated read email_sends" ON public.email_sends FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read email_unsubscribes" ON public.email_unsubscribes;
CREATE POLICY "authenticated read email_unsubscribes" ON public.email_unsubscribes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read performance events" ON public.performance_events;
CREATE POLICY "authenticated read performance events" ON public.performance_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read performance settings" ON public.performance_settings;
CREATE POLICY "authenticated read performance settings" ON public.performance_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read reunioes_disponibilidade" ON public.reunioes_disponibilidade;
CREATE POLICY "authenticated read reunioes_disponibilidade" ON public.reunioes_disponibilidade FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "blog_likes authenticated full access" ON public.blog_likes;
create policy "blog_likes authenticated full access" on public.blog_likes for all to authenticated using (true) with check (true);

DROP POLICY IF EXISTS "blog_comments authenticated full access" ON public.blog_comments;
create policy "blog_comments authenticated full access" on public.blog_comments for all to authenticated using (true) with check (true);

DROP POLICY IF EXISTS "auth read shared" ON public.shared_state;
CREATE POLICY "auth read shared" ON public.shared_state FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "self insert shared" ON public.shared_state;
CREATE POLICY "self insert shared" ON public.shared_state FOR INSERT TO authenticated WITH CHECK (updated_by = auth.uid());

DROP POLICY IF EXISTS "self update shared" ON public.shared_state;
CREATE POLICY "self update shared" ON public.shared_state FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (updated_by = auth.uid());

DROP POLICY IF EXISTS "entrega_anexos_read_authenticated" ON storage.objects;
CREATE POLICY "entrega_anexos_read_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'entrega-anexos');

DROP POLICY IF EXISTS "entrega_anexos_insert_authenticated" ON storage.objects;
CREATE POLICY "entrega_anexos_insert_authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'entrega-anexos' AND owner = auth.uid());

DROP POLICY IF EXISTS "entrega_anexos_delete_own" ON storage.objects;
CREATE POLICY "entrega_anexos_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'entrega-anexos' AND owner = auth.uid());

DROP POLICY IF EXISTS "financeiro_anexos_read_authenticated" ON storage.objects;
CREATE POLICY "financeiro_anexos_read_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'financeiro-anexos');

DROP POLICY IF EXISTS "financeiro_anexos_insert_authenticated" ON storage.objects;
CREATE POLICY "financeiro_anexos_insert_authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'financeiro-anexos' AND owner = auth.uid());

DROP POLICY IF EXISTS "financeiro_anexos_delete_own" ON storage.objects;
CREATE POLICY "financeiro_anexos_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'financeiro-anexos' AND owner = auth.uid());

DROP POLICY IF EXISTS "relatorios_mensais_read_authenticated" ON storage.objects;
CREATE POLICY "relatorios_mensais_read_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'relatorios-mensais');

DROP POLICY IF EXISTS "relatorios_mensais_insert_authenticated" ON storage.objects;
CREATE POLICY "relatorios_mensais_insert_authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'relatorios-mensais' AND owner = auth.uid());

DROP POLICY IF EXISTS "relatorios_mensais_delete_own" ON storage.objects;
CREATE POLICY "relatorios_mensais_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'relatorios-mensais' AND owner = auth.uid());

DROP POLICY IF EXISTS "aeo_evidencias_read_authenticated" ON storage.objects;
CREATE POLICY "aeo_evidencias_read_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'aeo-evidencias');

DROP POLICY IF EXISTS "aeo_evidencias_insert_authenticated" ON storage.objects;
CREATE POLICY "aeo_evidencias_insert_authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'aeo-evidencias');

DROP POLICY IF EXISTS "aeo_evidencias_update_authenticated" ON storage.objects;
CREATE POLICY "aeo_evidencias_update_authenticated" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'aeo-evidencias');

DROP POLICY IF EXISTS "aeo_evidencias_delete_authenticated" ON storage.objects;
CREATE POLICY "aeo_evidencias_delete_authenticated" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'aeo-evidencias');

DROP POLICY IF EXISTS "task_attachments_insert_authenticated" ON storage.objects;
create policy "task_attachments_insert_authenticated" on storage.objects for insert to authenticated with check (bucket_id = 'task-attachments' and owner = auth.uid());

DROP POLICY IF EXISTS "task_attachments_read_authenticated" ON storage.objects;
create policy "task_attachments_read_authenticated" on storage.objects for select to authenticated using (bucket_id = 'task-attachments');

DROP POLICY IF EXISTS "task_attachments_delete_own" ON storage.objects;
create policy "task_attachments_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'task-attachments' and owner = auth.uid());

DROP INDEX IF EXISTS public.organization_members_user_id_idx;

-- (search_path da função: ALTER FUNCTION public.enforce_cliente_archive_admin_only() RESET search_path;)
```
