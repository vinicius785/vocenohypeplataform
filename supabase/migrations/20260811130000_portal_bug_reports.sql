-- Permite relatos de bug enviados anonimamente pelo portal público do
-- cliente (sem `auth.uid()`): reporter_id vira opcional e ganha
-- client_label pra identificar a origem quando não houver usuário logado.
ALTER TABLE public.bug_reports ALTER COLUMN reporter_id DROP NOT NULL;
ALTER TABLE public.bug_reports ADD COLUMN client_label TEXT;
