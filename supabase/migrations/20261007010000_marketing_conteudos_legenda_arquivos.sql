-- Calendário Editorial: legenda + arquivos do conteúdo, e o bucket privado dos arquivos.
ALTER TABLE public.marketing_conteudos
  ADD COLUMN IF NOT EXISTS legenda TEXT,
  ADD COLUMN IF NOT EXISTS arquivos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Bucket PRIVADO e interno: só o time interno com a permissão `projetos` lê, envia e apaga
-- (diferente de `task-attachments`, que qualquer conta logada lê). Vídeos: limite de 500 MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('marketing-conteudos', 'marketing-conteudos', false, 524288000)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

CREATE POLICY "marketing_conteudos_files_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'marketing-conteudos'
    AND public.has_permission(auth.uid(), 'projetos')
    AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
  );
CREATE POLICY "marketing_conteudos_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'marketing-conteudos'
    AND public.has_permission(auth.uid(), 'projetos')
    AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
  );
CREATE POLICY "marketing_conteudos_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'marketing-conteudos'
    AND public.has_permission(auth.uid(), 'projetos')
    AND (public.is_internal_team_member(auth.uid()) OR public.is_admin(auth.uid()))
  );
