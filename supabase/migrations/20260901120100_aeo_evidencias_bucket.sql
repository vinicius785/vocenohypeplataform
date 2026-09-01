-- Evidências (prints) de respostas do AEO Monitor — hoje embutidas como
-- data: URL base64 direto na linha JSONB de aeo_respostas, o que infla
-- toda leitura da tabela (mesmo problema já documentado e corrigido pra
-- entrega-anexos, ver 20260808120000_entrega_anexos_bucket.sql). Move pro
-- Storage. Recurso compartilhado do time inteiro (mesmo espírito da RLS
-- já existente em aeo_respostas — authenticated USING(true) — não travado
-- por owner, já que qualquer pessoa do time pode substituir/remover a
-- evidência de uma resposta que não foi ela quem enviou.
insert into storage.buckets (id, name, public)
values ('aeo-evidencias', 'aeo-evidencias', false)
on conflict (id) do nothing;

CREATE POLICY "aeo_evidencias_read_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'aeo-evidencias');

CREATE POLICY "aeo_evidencias_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'aeo-evidencias');

CREATE POLICY "aeo_evidencias_update_authenticated"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'aeo-evidencias');

CREATE POLICY "aeo_evidencias_delete_authenticated"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'aeo-evidencias');
