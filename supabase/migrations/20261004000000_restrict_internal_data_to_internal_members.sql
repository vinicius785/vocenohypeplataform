-- Restringe a membros INTERNOS (e admins) os dados internos que hoje qualquer usuário
-- `authenticated` lê/escreve — o que inclui as contas do Portal do Cliente, que usam o
-- mesmo Supabase Auth e a mesma chave anon pública do front.
--
-- ACHADOS (auditoria 2026-10-03, por análise estática das migrations — conferir no banco
-- vivo com as consultas de docs/security/rls-internal-only.md ANTES de aplicar):
--   * Tabelas com policy `TO authenticated USING (true)`: pricing_settings (percentuais de
--     margem/comissão da agência), shared_state (leitura total + UPDATE de qualquer linha),
--     task_tags, aeo_*, email_sends / email_unsubscribes (e-mails de destinatários),
--     performance_events / performance_settings, reunioes_disponibilidade, blog_likes /
--     blog_comments.
--   * Storage: SELECT (e INSERT/DELETE) `TO authenticated` só com `bucket_id = '...'` em
--     entrega-anexos, financeiro-anexos, relatorios-mensais, aeo-evidencias e
--     task-attachments — um cliente logado conseguiria listar/baixar relatórios de OUTROS
--     clientes e anexos financeiros da agência. (chat-attachments já tinha sido corrigido em
--     20260928120000.)
--
-- IMPACTO ESPERADO: nenhum para a equipe (todo membro ativo de organização interna passa em
-- `is_internal_team_member`; admins passam em `is_admin`). O Portal do Cliente acessa tudo
-- isso por server functions com service-role (que ignora RLS) e, com o cliente do usuário,
-- só `profiles` e o bucket `avatars` — não afetados.
--
-- ROLLBACK: docs/security/rls-internal-only.md (recria as policies originais).
-- Operação idempotente: DROP POLICY IF EXISTS + CREATE.

DROP POLICY IF EXISTS "authenticated read pricing" ON public.pricing_settings;
CREATE POLICY "authenticated read pricing" ON public.pricing_settings FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read task_tags" ON public.task_tags;
CREATE POLICY "authenticated read task_tags" ON public.task_tags FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated insert task_tags" ON public.task_tags;
CREATE POLICY "authenticated insert task_tags" ON public.task_tags FOR INSERT TO authenticated WITH CHECK (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated update task_tags" ON public.task_tags;
CREATE POLICY "authenticated update task_tags" ON public.task_tags FOR UPDATE TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) WITH CHECK (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated delete task_tags" ON public.task_tags;
CREATE POLICY "authenticated delete task_tags" ON public.task_tags FOR DELETE TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read aeo_prompts" ON public.aeo_prompts;
CREATE POLICY "authenticated read aeo_prompts" ON public.aeo_prompts FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated insert aeo_prompts" ON public.aeo_prompts;
CREATE POLICY "authenticated insert aeo_prompts" ON public.aeo_prompts FOR INSERT TO authenticated WITH CHECK (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated update aeo_prompts" ON public.aeo_prompts;
CREATE POLICY "authenticated update aeo_prompts" ON public.aeo_prompts FOR UPDATE TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) WITH CHECK (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated delete aeo_prompts" ON public.aeo_prompts;
CREATE POLICY "authenticated delete aeo_prompts" ON public.aeo_prompts FOR DELETE TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read aeo_respostas" ON public.aeo_respostas;
CREATE POLICY "authenticated read aeo_respostas" ON public.aeo_respostas FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated insert aeo_respostas" ON public.aeo_respostas;
CREATE POLICY "authenticated insert aeo_respostas" ON public.aeo_respostas FOR INSERT TO authenticated WITH CHECK (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated update aeo_respostas" ON public.aeo_respostas;
CREATE POLICY "authenticated update aeo_respostas" ON public.aeo_respostas FOR UPDATE TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) WITH CHECK (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated delete aeo_respostas" ON public.aeo_respostas;
CREATE POLICY "authenticated delete aeo_respostas" ON public.aeo_respostas FOR DELETE TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read aeo_rodadas" ON public.aeo_rodadas;
CREATE POLICY "authenticated read aeo_rodadas" ON public.aeo_rodadas FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated insert aeo_rodadas" ON public.aeo_rodadas;
CREATE POLICY "authenticated insert aeo_rodadas" ON public.aeo_rodadas FOR INSERT TO authenticated WITH CHECK (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated update aeo_rodadas" ON public.aeo_rodadas;
CREATE POLICY "authenticated update aeo_rodadas" ON public.aeo_rodadas FOR UPDATE TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) WITH CHECK (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated delete aeo_rodadas" ON public.aeo_rodadas;
CREATE POLICY "authenticated delete aeo_rodadas" ON public.aeo_rodadas FOR DELETE TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read email_sends" ON public.email_sends;
CREATE POLICY "authenticated read email_sends" ON public.email_sends FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read email_unsubscribes" ON public.email_unsubscribes;
CREATE POLICY "authenticated read email_unsubscribes" ON public.email_unsubscribes FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read performance events" ON public.performance_events;
CREATE POLICY "authenticated read performance events" ON public.performance_events FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read performance settings" ON public.performance_settings;
CREATE POLICY "authenticated read performance settings" ON public.performance_settings FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "authenticated read reunioes_disponibilidade" ON public.reunioes_disponibilidade;
CREATE POLICY "authenticated read reunioes_disponibilidade" ON public.reunioes_disponibilidade FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "blog_likes authenticated full access" ON public.blog_likes;
create policy "blog_likes authenticated full access" on public.blog_likes for all to authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) WITH CHECK (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "blog_comments authenticated full access" ON public.blog_comments;
create policy "blog_comments authenticated full access" on public.blog_comments for all to authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) WITH CHECK (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

-- shared_state: leitura e escrita só para internos/admins (UPDATE deixava qualquer logado alterar qualquer linha).

DROP POLICY IF EXISTS "auth read shared" ON public.shared_state;
CREATE POLICY "auth read shared" ON public.shared_state FOR SELECT TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "self insert shared" ON public.shared_state;
CREATE POLICY "self insert shared" ON public.shared_state FOR INSERT TO authenticated WITH CHECK (updated_by = auth.uid() AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "self update shared" ON public.shared_state;
CREATE POLICY "self update shared" ON public.shared_state FOR UPDATE TO authenticated USING (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) WITH CHECK (updated_by = auth.uid() AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())));

-- Storage: buckets de dados internos/por cliente só para internos/admins.

DROP POLICY IF EXISTS "entrega_anexos_read_authenticated" ON storage.objects;
CREATE POLICY "entrega_anexos_read_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'entrega-anexos' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "entrega_anexos_insert_authenticated" ON storage.objects;
CREATE POLICY "entrega_anexos_insert_authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'entrega-anexos' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) AND owner = auth.uid());

DROP POLICY IF EXISTS "entrega_anexos_delete_own" ON storage.objects;
CREATE POLICY "entrega_anexos_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'entrega-anexos' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) AND owner = auth.uid());

DROP POLICY IF EXISTS "financeiro_anexos_read_authenticated" ON storage.objects;
CREATE POLICY "financeiro_anexos_read_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'financeiro-anexos' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "financeiro_anexos_insert_authenticated" ON storage.objects;
CREATE POLICY "financeiro_anexos_insert_authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'financeiro-anexos' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) AND owner = auth.uid());

DROP POLICY IF EXISTS "financeiro_anexos_delete_own" ON storage.objects;
CREATE POLICY "financeiro_anexos_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'financeiro-anexos' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) AND owner = auth.uid());

DROP POLICY IF EXISTS "relatorios_mensais_read_authenticated" ON storage.objects;
CREATE POLICY "relatorios_mensais_read_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'relatorios-mensais' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "relatorios_mensais_insert_authenticated" ON storage.objects;
CREATE POLICY "relatorios_mensais_insert_authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'relatorios-mensais' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) AND owner = auth.uid());

DROP POLICY IF EXISTS "relatorios_mensais_delete_own" ON storage.objects;
CREATE POLICY "relatorios_mensais_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'relatorios-mensais' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) AND owner = auth.uid());

DROP POLICY IF EXISTS "aeo_evidencias_read_authenticated" ON storage.objects;
CREATE POLICY "aeo_evidencias_read_authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'aeo-evidencias' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "aeo_evidencias_insert_authenticated" ON storage.objects;
CREATE POLICY "aeo_evidencias_insert_authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'aeo-evidencias' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "aeo_evidencias_update_authenticated" ON storage.objects;
CREATE POLICY "aeo_evidencias_update_authenticated" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'aeo-evidencias' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "aeo_evidencias_delete_authenticated" ON storage.objects;
CREATE POLICY "aeo_evidencias_delete_authenticated" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'aeo-evidencias' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "task_attachments_insert_authenticated" ON storage.objects;
CREATE POLICY "task_attachments_insert_authenticated" ON storage.objects for insert to authenticated with check (bucket_id = 'task-attachments' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) and owner = auth.uid());

DROP POLICY IF EXISTS "task_attachments_read_authenticated" ON storage.objects;
CREATE POLICY "task_attachments_read_authenticated" ON storage.objects for select to authenticated using (bucket_id = 'task-attachments' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "task_attachments_delete_own" ON storage.objects;
CREATE POLICY "task_attachments_delete_own" ON storage.objects for delete to authenticated using (bucket_id = 'task-attachments' AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid())) and owner = auth.uid());

-- Função SECURITY DEFINER sem search_path fixo (hardening).
ALTER FUNCTION public.enforce_cliente_archive_admin_only() SET search_path = public;

-- Índice no caminho quente do RLS: `is_internal_team_member`, `resolveUserEnvironment` e
-- `is_active_client_admin_of` filtram organization_members por user_id, mas a única chave
-- existente é UNIQUE(organization_id, user_id) (user_id não é a coluna líder).
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx
  ON public.organization_members (user_id)
  WHERE status = 'active';
