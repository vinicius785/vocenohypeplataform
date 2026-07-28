
CREATE POLICY "chat_attachments_read_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attachments_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-attachments' AND owner = auth.uid());

CREATE POLICY "chat_attachments_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-attachments' AND owner = auth.uid());
