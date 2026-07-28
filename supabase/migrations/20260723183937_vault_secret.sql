CREATE TABLE public.vault_secret (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  key_b64 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vault_secret_singleton CHECK (id)
);

ALTER TABLE public.vault_secret ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies for authenticated/anon and no GRANTs to them either:
-- this table must only ever be reachable through the service-role client used
-- by the getVaultKey server function (src/lib/vault.functions.ts), which itself
-- gates on is_admin before returning the key. Direct client reads are impossible.
GRANT ALL ON public.vault_secret TO service_role;

INSERT INTO public.vault_secret (id, key_b64)
VALUES (true, encode(gen_random_bytes(32), 'base64'));
