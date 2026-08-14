-- Anexos de lançamentos do Financeiro (comprovantes, notas fiscais, etc) —
-- antes só existia um único arquivo (nota fiscal) salvo como data: URL
-- (base64) direto na linha JSONB, limitado a 4MB e sem suportar mais de um
-- arquivo por lançamento. Move pro Storage, mesmo padrão já usado em
-- entrega-anexos: qualquer membro do time pode ler (uso interno), só o
-- dono pode inserir/apagar o próprio arquivo.
insert into storage.buckets (id, name, public)
values ('financeiro-anexos', 'financeiro-anexos', false)
on conflict (id) do nothing;

CREATE POLICY "financeiro_anexos_read_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'financeiro-anexos');

CREATE POLICY "financeiro_anexos_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'financeiro-anexos' AND owner = auth.uid());

CREATE POLICY "financeiro_anexos_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'financeiro-anexos' AND owner = auth.uid());
