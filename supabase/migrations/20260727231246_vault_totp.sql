ALTER PUBLICATION supabase_realtime DROP TABLE public.vault_access_requests;
DROP TABLE public.vault_access_requests;

CREATE TABLE public.vault_totp_secrets (
  admin_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vault_totp_secrets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.vault_totp_secrets TO service_role;

CREATE TABLE public.vault_totp_attempts (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  failed_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);
ALTER TABLE public.vault_totp_attempts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.vault_totp_attempts TO service_role;
