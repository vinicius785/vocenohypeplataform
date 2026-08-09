-- Anexos de entrega (roteiro, gravação, conteúdo publicado) — antes eram
-- salvos como data: URL (base64) direto na linha JSONB de
-- campanha_influenciadores, o que falha silenciosamente pra arquivos
-- maiores (vídeos): o upload nunca terminava de fato e o anexo sumia. Move
-- pro Storage, mesmo padrão já usado em chat-attachments — qualquer membro
-- do time pode ler (uso interno + link público de aprovação), só o dono
-- pode inserir/apagar o próprio arquivo.
insert into storage.buckets (id, name, public)
values ('entrega-anexos', 'entrega-anexos', false)
on conflict (id) do nothing;

CREATE POLICY "entrega_anexos_read_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'entrega-anexos');

CREATE POLICY "entrega_anexos_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'entrega-anexos' AND owner = auth.uid());

CREATE POLICY "entrega_anexos_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'entrega-anexos' AND owner = auth.uid());
